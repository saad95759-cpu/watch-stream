import mongoose from "mongoose";

const uri = process.env.MONGO_URI || "mongodb+srv://saad95759_db_user:umzki90ulC50mlU1@watchme.t4ioqjj.mongodb.net/watch-stream?appName=WATCHME";

mongoose.set('bufferCommands', false);

// In-Memory Mock Database Store
let mockLogs = [];
let mockBans = [];

class MockRoomLogModel {
  constructor(data) {
    this.data = { ...data, _id: Math.random().toString(36).substring(2, 9), createdAt: new Date(), ts: Date.now() };
  }
  async save() {
    mockLogs.push(this.data);
    return this.data;
  }
  static async create(data) {
    const record = { ...data, _id: Math.random().toString(36).substring(2, 9), createdAt: new Date(), ts: Date.now() };
    mockLogs.push(record);
    return record;
  }
  static find(query) {
    let results = [...mockLogs];
    if (query && query.roomId) {
      results = results.filter(r => r.roomId === query.roomId);
    }
    const chain = {
      sort: (sortObj) => {
        const key = Object.keys(sortObj)[0];
        const order = sortObj[key];
        results.sort((a, b) => {
          if (a[key] < b[key]) return order === -1 ? 1 : -1;
          if (a[key] > b[key]) return order === -1 ? -1 : 1;
          return 0;
        });
        return chain;
      },
      limit: (n) => {
        results = results.slice(0, n);
        return chain;
      },
      lean: () => chain,
      exec: async () => results,
      then: (resolve, reject) => Promise.resolve(results).then(resolve, reject)
    };
    return chain;
  }
  static async countDocuments(query) {
    let results = [...mockLogs];
    if (query) {
      if (query.roomId) {
        results = results.filter(r => r.roomId === query.roomId);
      }
      if (query.type) {
        results = results.filter(r => r.type === query.type);
      }
    }
    return results.length;
  }
  static async findOne(query) {
    let results = [...mockLogs];
    if (query && query.roomId) {
      results = results.filter(r => r.roomId === query.roomId);
    }
    return results[0] || null;
  }
  static async exists(query) {
    const found = await this.findOne(query);
    return found ? { _id: found._id } : null;
  }
  static async deleteMany(query) {
    const originalCount = mockLogs.length;
    if (query && query.roomId) {
      mockLogs = mockLogs.filter(r => r.roomId !== query.roomId);
    }
    return { deletedCount: originalCount - mockLogs.length };
  }
}

class MockIpBanModel {
  static async findOne(query) {
    const now = new Date();
    const found = mockBans.find(b => b.roomId === query.roomId && b.ip === query.ip && b.expiresAt > now);
    return found || null;
  }
  static async exists(query) {
    const found = await this.findOne(query);
    return found ? { _id: found._id } : null;
  }
  static async create(data) {
    const record = { ...data, _id: Math.random().toString(36).substring(2, 9) };
    mockBans.push(record);
    return record;
  }
  static async deleteMany(query) {
    const originalCount = mockBans.length;
    mockBans = mockBans.filter(b => !(b.roomId === query.roomId && b.ip === query.ip));
    return { deletedCount: originalCount - mockBans.length };
  }
}

// Schemas for mongoose (compiled only on successful connect)
const logSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  eventId: { type: String },
  type: { type: String, required: true },
  text: String,
  name: String,
  url: String,
  playedByName: String,
  role: String,
  hasPassword: Boolean,
  clientIp: String,
  gps: {
    latitude: Number,
    longitude: Number,
    status: String
  },
  durationMinutes: Number,
  ts: { type: Number, default: () => Date.now() },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

logSchema.index({ roomId: 1, ts: -1 });
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

const banSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  ip: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});

export let RoomLog = MockRoomLogModel;
export let IpBan = MockIpBanModel;

export async function connectDB() {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB Connected Successfully");
    RoomLog = mongoose.model("RoomLog", logSchema);
    IpBan = mongoose.model("IpBan", banSchema);
  } catch (err) {
    console.warn("⚠️ Atlas MongoDB Auth failed or offline. Falling back to In-Memory Mock database.");
    RoomLog = MockRoomLogModel;
    IpBan = MockIpBanModel;
  }
}
