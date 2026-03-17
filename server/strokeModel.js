const mongoose = require("mongoose");

const strokeSchema = new mongoose.Schema({
  type: { type: String, default: 'pen' },
  x0: Number,
  y0: Number,
  x1: Number,
  y1: Number,
  color: String,
  bgColor: String,
  size: Number,
  isEraser: Boolean,
  fillStyle: String,
  strokeStyle: String,
  sloppiness: Number,
  opacity: Number
});

module.exports = mongoose.model("Stroke", strokeSchema);
