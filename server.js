const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// Serve static files from the 'dist' folder
// Note: __dirname is built-in to Node.js when using CommonJS
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing by serving index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Explicitly bind to 0.0.0.0 for Cloud Run
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});