const http = require('http');
const fs = require('fs');
const path = require('path');

// Define MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Get the content type based on file extension
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'text/plain';
}

// Create HTTP server
const server = http.createServer((req, res) => {
    // Parse the URL to get the file path
    let filePath = req.url;
    
    // Default routes
    if (filePath === '/') {
        filePath = '/verb-analyzer.html';
    } else if (filePath === '/frequency') {
        filePath = '/word-frequency.html';
    }
    
    // Remove query parameters
    filePath = filePath.split('?')[0];
    
    // Construct the full file path
    const fullPath = path.join(__dirname, filePath);
    
    // Security check: ensure the path is within the current directory
    const normalizedPath = path.normalize(fullPath);
    if (!normalizedPath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    // Check if file exists
    fs.access(normalizedPath, fs.constants.F_OK, (err) => {
        if (err) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>404 - Not Found</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .error { color: #e74c3c; font-size: 2em; margin-bottom: 20px; }
                        .message { color: #7f8c8d; font-size: 1.2em; }
                        .links { margin-top: 30px; }
                        .links a { color: #3498db; text-decoration: none; margin: 0 10px; }
                        .links a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <div class="error">404 - File Not Found</div>
                    <div class="message">The requested file "${filePath}" could not be found.</div>
                    <div class="links">
                        <a href="/">Go to Italian Verbs Analyzer</a>
                        <a href="/words.json">View JSON Data</a>
                    </div>
                </body>
                </html>
            `);
            return;
        }

        // Read and serve the file
        fs.readFile(normalizedPath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }

            // Set the appropriate content type
            const contentType = getContentType(normalizedPath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*', // Enable CORS for JSON files
                'Cache-Control': 'no-cache' // Disable caching for development
            });
            res.end(data);
        });
    });
});

// Get port from environment variable or use default
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Start the server
server.listen(PORT, HOST, () => {
    console.log('\n🇮🇹 Italian Learning Platform Server Started! 🇮🇹');
    console.log('==========================================');
    console.log(`📍 Server running at: http://${HOST}:${PORT}`);
    console.log(`📚 Vocabulary Browser: http://${HOST}:${PORT}/`);
    console.log(`📊 Frequency Analyzer: http://${HOST}:${PORT}/frequency`);
    console.log(`📄 JSON Data: http://${HOST}:${PORT}/words.json`);
    console.log('==========================================');
    console.log('Press Ctrl+C to stop the server\n');
    
    // List available files
    console.log('Available files:');
    fs.readdir(__dirname, (err, files) => {
        if (!err) {
            files
                .filter(file => ['.html', '.js', '.json', '.css'].some(ext => file.endsWith(ext)))
                .forEach(file => {
                    console.log(`  📁 ${file} → http://${HOST}:${PORT}/${file}`);
                });
        }
    });
    console.log('');
});

// Handle server errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Error: Port ${PORT} is already in use.`);
        console.error(`Try running with a different port: PORT=3001 npm run serve`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server gracefully...');
    server.close(() => {
        console.log('✅ Server closed successfully!');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n👋 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed successfully!');
        process.exit(0);
    });
});

module.exports = server;
