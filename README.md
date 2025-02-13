# mama
a real-time translator for mama

The need for instant language translation often arises spontaneously in daily life, but current solutions—requiring users to unlock a phone, open an app, and navigate a UI—are slow, distracting, and unnatural. A more seamless, intuitive approach is needed.

sudo apt update && sudo apt upgrade -y

sudo apt install nodejs npm -y

cd townhall
npm install
npm install redis dotenv

node wss.js to start the server
login with browser to https://127.0.0.1:3000/speaker.html and click start stream
login with browser to https://127.0.0.1:3000/ and see the streaming 



Reload systemd to recognize the new service:

bash
Copy
sudo systemctl daemon-reload
Enable the service to start on boot:

bash
Copy
sudo systemctl enable wss.service
Start the service immediately (optional, to test it now):

bash
Copy
sudo systemctl start wss.service
Check the status of your service:

bash
Copy
sudo systemctl status wss.service
