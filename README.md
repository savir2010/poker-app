# 🃏 Poker Party App

A full-stack Poker Party application using Ionic React frontend and a Python Flask backend with MongoDB for storing party data.

---

## 🚀 Features

- Host and join poker parties
- Modern Ionic React frontend
- Flask backend with MongoDB integration
- iOS emulator support via Capacitor

---

## 🧰 Prerequisites

Make sure you have the following installed:

- Python 3.8+
- Node.js (v16 or v18 recommended)
- npm
- MongoDB 
- Xcode (for iOS emulator)

---

## 🔧 Installation Instructions

### Clone the repository (if not already)

git clone https://github.com/savir2010/poker-app.git

# Create and activate a virtual environment
1. python3 -m venv venv
2. source venv/bin/activate 

# Install Python dependencies
pip install -r requirements.txt

# Make sure to set up your MongoDB and replace the connection string in server.py.
Database: party_app
Collection: parties

# Install Ionic CLI globally
npm install -g @ionic/cli

# Navigate to frontend folder
cd poker-frontend

# Install dependencies
npm install

# Run the development server
ionic serve   # or npm run dev

# Run Server
cd .. (go to root directory)

# Make sure you are in venv
python server.py

# To run on emulator (Make sure you're on a Mac with Xcode installed)

1. cd poker-frontend
2. ionic build
3. npx cap copy ios
4. npx cap open ios

Open the Xcode project that launches.
Select an emulator
Press the Run button.


### Further questions ask Savir
