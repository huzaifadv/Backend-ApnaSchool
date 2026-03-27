import mongoose from 'mongoose';

const superAdminNoticeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  targetAll: { type: Boolean, default: false },
  targetSchools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'School' }],
}, { timestamps: true });

const SuperAdminNotice = mongoose.model('SuperAdminNotice', superAdminNoticeSchema);
export default SuperAdminNotice;
