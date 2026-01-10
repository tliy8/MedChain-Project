# MedChain Project

A Blockchain Medical Record System using **Hyperledger Fabric and IPFS**.

# ⚡ Prerequisites
Make sure you have **Docker**, **Node.js**, and **Hyperledger Fabric** installed in Ubuntu (WSL).

---

# 🚀 How to Start (Run in 4 Terminals)

# Terminal 1: Start Blockchain
```bash
cd network
./network.sh up createChannel -ca -s couchdb
./network.sh deployCC -ccn medchain -ccp ../chaincode/medchain/ -ccl javascript

# Terminal 2: Start Backend
cd server
npm install
node enrollAdmin.js
node registerUser.js
node server.js

# Terminal 3: Start IPFS Storage
ipfs daemon

# Terminal 4: Start Frontend
cd fe
python3 -m http.server

🌐 Open the Website
Go to your browser and visit: 👉 http://localhost:8000

Login 
Username:admin
Password:password123