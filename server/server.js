require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const Stroke = require("./strokeModel");

const app = express();
app.use(cors());

// Health Check Route
app.get("/", (req, res) => {
  res.send({
    status: "Server is Live",
    dbConnection: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    socketClients: io.engine.clientsCount
  });
});

const server = http.createServer(app);

const io = socketIo(server, {
  cors: { origin: "*" }
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("Database connection error:", err));

let strokeBatch = [];
let batchTimeout = null;

function saveBatch() {
  if (strokeBatch.length > 0) {
    const batchToSave = [...strokeBatch];
    strokeBatch = [];
    Stroke.insertMany(batchToSave).catch(err => console.error("Error saving batch:", err));
  }
  batchTimeout = null;
}

const users = new Map();
const names = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Riley", "Morgan"];
const avatarColors = ["#40c057", "#fa5252", "#15aabf", "#be4bdb", "#fd7e14"];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Initialize current user
  const randomName = names[Math.floor(Math.random() * names.length)];
  const initials = randomName.substring(0, 2).toUpperCase();
  const color = avatarColors[users.size % avatarColors.length];
  
  users.set(socket.id, { id: socket.id, name: randomName, initials, color, x: 0, y: 0 });

  // Broadcast updated user list to everyone
  io.emit("usersUpdate", Array.from(users.values()));

  socket.on("updateUser", (userData) => {
    const user = users.get(socket.id);
    if (user) {
      user.name = userData.name || user.name;
      user.initials = user.name.substring(0, 2).toUpperCase();
      io.emit("usersUpdate", Array.from(users.values()));
    }
  });

  // Send historical drawing data to the newly connected user immediately
  Stroke.find().then(strokes => {
    socket.emit("initData", strokes);
  });

  socket.on("draw", (data) => {
    // Broadcast to everyone EXCEPT the sender
    socket.broadcast.emit("draw", data);
    
    // Add to batch instead of immediately saving to prevent database freezing
    strokeBatch.push(data);
    
    // Save to DB in batches to handle high-frequency drawing optimally
    if (strokeBatch.length >= 50) {
      if (batchTimeout) clearTimeout(batchTimeout);
      saveBatch();
    } else if (!batchTimeout) {
      batchTimeout = setTimeout(saveBatch, 2000);
    }
  });

  socket.on("getReplay", async () => {
    // Make sure we save any pending strokes first!
    if (strokeBatch.length > 0) {
      if (batchTimeout) clearTimeout(batchTimeout);
      saveBatch();
    }
    
    // Small delay to ensure DB insertion is complete
    setTimeout(async () => {
      const strokes = await Stroke.find();
      socket.emit("replayData", strokes);
    }, 500);
  });

  socket.on("clearBoard", async () => {
    // Clear the pending batch
    strokeBatch = [];
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    
    // Broadcast clear to all other clients
    socket.broadcast.emit("clearBoard");
    
    // Wipe DB
    await Stroke.deleteMany({});
  });

  // Track live mouse cursors
  socket.on("cursorMove", (pos) => {
    const user = users.get(socket.id);
    if (user) {
      user.x = pos.x;
      user.y = pos.y;
      socket.broadcast.emit("cursorMove", { ...user, x: pos.x, y: pos.y });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    users.delete(socket.id);
    io.emit("usersUpdate", Array.from(users.values()));
    socket.broadcast.emit("userLeft", socket.id);
  });
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
