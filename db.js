import mongoose from "mongoose";

const uri = process.env.MONGO_URI || "mongodb+srv://saad95759_db_user:umzki90ulC50mlU1@watchme.t4ioqjj.mongodb.net/watch-stream?appName=WATCHME";

export async function connectDB() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB successfully");
  } catch (err) {
    console.error("MongoDB connection error. Retrying in 5s...", err.message);
    setTimeout(connectDB, 5000);
  }
}

// Model for Persistent Room Logs
const logSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  eventId: { type: String },
  type: { type: String, required: true }, // 'chat', 'system', 'video'
  text: String,
  name: String,
  url: String,
  playedByName: String,
  ts: { type: Number, default: () => Date.now() },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

logSchema.index({ roomId: 1, ts: -1 });
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

export const RoomLog = mongoose.model("RoomLog", logSchema);

// Model for IP-based Soft Bans (TTL index auto-deletes expired records)
const banSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  ip: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});

export const IpBan = mongoose.model("IpBan", banSchema);
