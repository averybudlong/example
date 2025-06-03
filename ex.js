// package.json
{
  "name": "mysql-table-viewer",
  "version": "1.0.0",
  "description": "Simple MySQL table viewer with Express and EJS",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ejs": "^3.1.9",
    "mysql2": "^3.6.0",
    "body-parser": "^1.20.2",
    "xlsx": "^0.18.5",
    "json2csv": "^6.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}

// server.js - Main application setup
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const indexRoutes = require('./routes/index');
const databaseRoutes = require('./routes/database');

// Use routes
app.use('/', indexRoutes);
app.use('/database', databaseRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// routes/index.js - Homepage routes
const express = require('express');
const router = express.Router();

// Homepage route
router.get('/', (req, res) => {
    res.render('index', { 
        error: null, 
        success: null,
        tables: null,
        selectedTable: null,
        data: null 
    });
});

module.exports = router;

// routes/database.js - Database-related routes
const express = require('express');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const { Parser } = require('json2csv');
const router = express.Router();

// Store connection info temporarily (in production, use sessions or secure storage)
let connectionConfig = null;

// Connect to database route
router.post('/connect', async (req, res) => {
    const { host, port, user, password, database } = req.body;
    
    connectionConfig = {
        host: host || 'localhost',
        port: port || 3306,
        user,
        password,
        database
    };

    try {
        const connection = await mysql.createConnection(connectionConfig);
        
        // Get list of tables
        const [tables] = await connection.execute('SHOW TABLES');
        await connection.end();
        
        res.render('index', {
            error: null,
            success: 'Connected successfully!',
            tables: tables,
            selectedTable: null,
            data: null
        });
    } catch (error) {
        res.render('index', {
            error: `Connection failed: ${error.message}`,
            success: null,
            tables: null,
            selectedTable: null,
            data: null
        });
    }
});

// View table data route
router.post('/view-table', async (req, res) => {
    const { tableName } = req.body;
    
    if (!connectionConfig) {
        return res.render('index', {
            error: 'Please connect to database first',
            success: null,
            tables: null,
            selectedTable: null,
            data: null
        });
    }

    try {
        const connection = await mysql.createConnection(connectionConfig);
        
        // Get table data
        const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
        
        // Get column information
        const [columns] = await connection.execute(`DESCRIBE \`${tableName}\``);
        
        // Get list of tables again for the dropdown
        const [tables] = await connection.execute('SHOW TABLES');
        
        await connection.end();
        
        res.render('index', {
            error: null,
            success: null,
            tables: tables,
            selectedTable: tableName,
            data: {
                columns: columns,
                rows: rows
            }
        });
    } catch (error) {
        res.render('index', {
            error: `Failed to fetch table data: ${error.message}`,
            success: null,
            tables: null,
            selectedTable: null,
            data: null
        });
    }
});

// Disconnect route (bonus feature)
router.post('/disconnect', (req, res) => {
    connectionConfig = null;
    res.render('index', {
        error: null,
        success: 'Disconnected from database',
        tables: null,
        selectedTable: null,
        data: null
    });
});

// Export table data routes
router.get('/export/:format/:tableName', async (req, res) => {
    const { format, tableName } = req.params;
    
    if (!connectionConfig) {
        return res.status(400).json({ error: 'No database connection' });
    }

    try {
        const connection = await mysql.createConnection(connectionConfig);
        
        // Get table data
        const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data found in table' });
        }

        const filename = `${tableName}_export_${new Date().toISOString().split('T')[0]}`;

        switch (format.toLowerCase()) {
            case 'csv':
                const csvParser = new Parser();
                const csv = csvParser.parse(rows);
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
                res.send(csv);
                break;

            case 'json':
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
                res.json(rows);
                break;

            case 'excel':
                const worksheet = XLSX.utils.json_to_sheet(rows);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
                
                const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
                res.send(excelBuffer);
                break;

            default:
                res.status(400).json({ error: 'Unsupported export format' });
        }

    } catch (error) {
        res.status(500).json({ error: `Export failed: ${error.message}` });
    }
});

// Export with custom query route
router.post('/export-query', async (req, res) => {
    const { query, format, filename } = req.body;
    
    if (!connectionConfig) {
        return res.status(400).json({ error: 'No database connection' });
    }

    try {
        const connection = await mysql.createConnection(connectionConfig);
        
        // Execute custom query
        const [rows] = await connection.execute(query);
        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No data found' });
        }

        const exportFilename = filename || `custom_export_${new Date().toISOString().split('T')[0]}`;

        switch (format.toLowerCase()) {
            case 'csv':
                const csvParser = new Parser();
                const csv = csvParser.parse(rows);
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.csv"`);
                res.send(csv);
                break;

            case 'json':
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.json"`);
                res.json(rows);
                break;

            case 'excel':
                const worksheet = XLSX.utils.json_to_sheet(rows);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Query Results');
                
                const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.xlsx"`);
                res.send(excelBuffer);
                break;

            default:
                res.status(400).json({ error: 'Unsupported export format' });
        }

    } catch (error) {
        res.status(500).json({ error: `Export failed: ${error.message}` });
    }
});

module.exports = router;

// views/index.ejs - Main template
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MySQL Table Viewer</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        h2 {
            color: #555;
            border-bottom: 2px solid #007bff;
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input, select, button {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        button {
            background-color: #007bff;
            color: white;
            border: none;
            cursor: pointer;
            font-weight: bold;
            margin-top: 10px;
        }
        button:hover {
            background-color: #0056b3;
        }
        .btn-secondary {
            background-color: #6c757d;
        }
        .btn-secondary:hover {
            background-color: #545b62;
        }
        .alert {
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .alert-error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .alert-success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #555;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .table-container {
            overflow-x: auto;
            margin-top: 20px;
        }
        .form-row {
            display: flex;
            gap: 15px;
        }
        .form-row .form-group {
            flex: 1;
        }
        .button-group {
            display: flex;
            gap: 10px;
        }
        .button-group button {
            flex: 1;
        }
        .export-buttons {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        .export-buttons a {
            flex: 1;
            padding: 8px 12px;
            background-color: #28a745;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            text-align: center;
            font-size: 14px;
            font-weight: bold;
        }
        .export-buttons a:hover {
            background-color: #218838;
        }
        .custom-query {
            margin-top: 20px;
        }
        .custom-query textarea {
            width: 100%;
            min-height: 100px;
            resize: vertical;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        .form-inline {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }
        .form-inline .form-group {
            flex: 1;
        }
        .form-inline button {
            margin-top: 0;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <h1>MySQL Table Viewer</h1>
    
    <div class="container">
        <h2>Database Connection</h2>
        <form action="/database/connect" method="POST">
            <div class="form-row">
                <div class="form-group">
                    <label for="host">Host:</label>
                    <input type="text" id="host" name="host" value="localhost" required>
                </div>
                <div class="form-group">
                    <label for="port">Port:</label>
                    <input type="number" id="port" name="port" value="3306" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="user">Username:</label>
                    <input type="text" id="user" name="user" required>
                </div>
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password">
                </div>
            </div>
            <div class="form-group">
                <label for="database">Database Name:</label>
                <input type="text" id="database" name="database" required>
            </div>
            <div class="button-group">
                <button type="submit">Connect to Database</button>
                <% if (tables) { %>
                    <form action="/database/disconnect" method="POST" style="flex: 1; margin: 0;">
                        <button type="submit" class="btn-secondary">Disconnect</button>
                    </form>
                <% } %>
            </div>
        </form>
    </div>

    <% if (error) { %>
        <div class="alert alert-error">
            <%= error %>
        </div>
    <% } %>

    <% if (success) { %>
        <div class="alert alert-success">
            <%= success %>
        </div>
    <% } %>

    <% if (tables && tables.length > 0) { %>
        <div class="container">
            <h2>Select Table to View</h2>
            <form action="/database/view-table" method="POST">
                <div class="form-group">
                    <label for="tableName">Available Tables:</label>
                    <select id="tableName" name="tableName" required>
                        <option value="">Select a table...</option>
                        <% tables.forEach(table => { %>
                            <% const tableName = Object.values(table)[0]; %>
                            <option value="<%= tableName %>" <%= selectedTable === tableName ? 'selected' : '' %>>
                                <%= tableName %>
                            </option>
                        <% }); %>
                    </select>
                </div>
                <button type="submit">View Table Data</button>
            </form>
        </div>
    <% } %>

    <% if (data && data.rows) { %>
        <div class="container">
            <h2>Table: <%= selectedTable %></h2>
            <p><strong>Total Records:</strong> <%= data.rows.length %></p>
            
            <!-- Export buttons -->
            <div class="export-buttons">
                <a href="/database/export/csv/<%= selectedTable %>" target="_blank">Export as CSV</a>
                <a href="/database/export/json/<%= selectedTable %>" target="_blank">Export as JSON</a>
                <a href="/database/export/excel/<%= selectedTable %>" target="_blank">Export as Excel</a>
            </div>
            
            <% if (data.rows.length > 0) { %>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <% data.columns.forEach(column => { %>
                                    <th><%= column.Field %></th>
                                <% }); %>
                            </tr>
                        </thead>
                        <tbody>
                            <% data.rows.forEach(row => { %>
                                <tr>
                                    <% data.columns.forEach(column => { %>
                                        <td><%= row[column.Field] || '' %></td>
                                    <% }); %>
                                </tr>
                            <% }); %>
                        </tbody>
                    </table>
                </div>
            <% } else { %>
                <p>No data found in this table.</p>
            <% } %>
        </div>
    <% } %>

    <!-- Custom Query Export Section -->
    <% if (tables && tables.length > 0) { %>
        <div class="container">
            <h2>Custom Query Export</h2>
            <p>Write a custom SQL query to export specific data:</p>
            
            <form id="customQueryForm">
                <div class="form-group">
                    <label for="customQuery">SQL Query:</label>
                    <textarea id="customQuery" name="query" placeholder="SELECT * FROM your_table WHERE condition..." required></textarea>
                </div>
                
                <div class="form-inline">
                    <div class="form-group">
                        <label for="exportFormat">Export Format:</label>
                        <select id="exportFormat" name="format" required>
                            <option value="csv">CSV</option>
                            <option value="json">JSON</option>
                            <option value="excel">Excel</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="exportFilename">Filename (optional):</label>
                        <input type="text" id="exportFilename" name="filename" placeholder="my_export">
                    </div>
                    
                    <button type="submit">Export Query Results</button>
                </div>
            </form>
        </div>
    <% } %>

    <script>
        // Handle custom query export
        document.getElementById('customQueryForm')?.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const query = formData.get('query');
            const format = formData.get('format');
            const filename = formData.get('filename');
            
            try {
                const response = await fetch('/database/export-query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query, format, filename })
                });
                
                if (response.ok) {
                    // Get the filename from response headers
                    const contentDisposition = response.headers.get('Content-Disposition');
                    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
                    const downloadFilename = filenameMatch ? filenameMatch[1] : `export.${format}`;
                    
                    // Create blob and download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = downloadFilename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } else {
                    const error = await response.json();
                    alert('Export failed: ' + error.error);
                }
            } catch (error) {
                alert('Export failed: ' + error.message);
            }
        });
    </script>
</body>
</html>

// views/partials/header.ejs - Reusable header (optional)
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title || 'MySQL Table Viewer' %></title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>

// views/partials/footer.ejs - Reusable footer (optional)
</body>
</html>

// Installation and Setup Instructions:

/*
Directory Structure:
mysql-table-viewer/
├── server.js              # Main app setup
├── package.json           # Dependencies
├── routes/                # Route handlers (logic)
│   ├── index.js          # Homepage routes
│   └── database.js       # Database routes
├── views/                 # Templates (presentation)
│   ├── index.ejs         # Main page template
│   └── partials/         # Reusable template parts
│       ├── header.ejs    # Common header
│       └── footer.ejs    # Common footer
└── public/               # Static files (CSS, JS, images)
    └── css/
        └── style.css     # Optional external styles

Setup Steps:
1. Create directory: mkdir mysql-table-viewer && cd mysql-table-viewer
2. Create subdirectories: mkdir routes views views/partials public public/css
3. Save each file to its respective location
4. Run: npm install
5. Start: npm start
6. Visit: http://localhost:3000

Key Benefits of This Structure:
- server.js: Clean, focused on app setup
- routes/: Separated business logic by feature
- views/: Templates are organized and reusable
- Clear separation of concerns
- Easy to maintain and scale
- Team-friendly (designers work on views, developers on routes)
*/
