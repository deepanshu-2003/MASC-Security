import mongoose from 'mongoose';

const nonceSchema = new mongoose.Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 300 // TTL Index: Expires and automatically deleted after 5 minutes (300 seconds)
    }
  }
);

const Nonce = mongoose.model('Nonce', nonceSchema);
export default Nonce;
