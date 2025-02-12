require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const { Server } = require('ws');
const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public'));

// Read SSL certificate files
const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
};

// Create an HTTPS server
const server = https.createServer(options, app);
server.listen(3000, '0.0.0.0', () => {
  console.log('HTTPS server running on https://localhost:3000');
});

// Export the server to be used in another file
module.exports = server;
