import mongoose from 'mongoose';
import { seedRoles } from './seedRoles.js';
import DynamicField from '../models/DynamicField.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/masc-security');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await seedRoles();

    // Migrate legacy admins to unified User collection
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const hasAdminsCollection = collections.some(c => c.name === 'admins');
    if (hasAdminsCollection) {
      const legacyAdmins = await db.collection('admins').find({}).toArray();
      if (legacyAdmins.length > 0) {
        console.log(`[MIGRATION] Found ${legacyAdmins.length} legacy admins in 'admins' collection. Starting migration...`);
        
        // Find default or first organization
        let org = await db.collection('organizations').findOne({});
        if (!org) {
          const insertOrg = await db.collection('organizations').insertOne({
            name: 'MASC Security Corporation',
            logoUrl: '',
            theme: 'light',
            primaryGradientStart: '#7C3AED',
            primaryGradientEnd: '#A855F7',
            secondaryGradientStart: '#9333EA',
            secondaryGradientEnd: '#C084FC',
            accentColor: '#8B5CF6',
            typography: 'Outfit',
            vaultMode: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          org = { _id: insertOrg.insertedId };
        }

        for (const legacyAdmin of legacyAdmins) {
          const emailLower = legacyAdmin.email.toLowerCase().trim();
          
          // Check if already exists in User collection
          const userExists = await db.collection('users').findOne({ email: emailLower });
          if (!userExists) {
            const nameParts = (legacyAdmin.name || 'Admin User').trim().split(/\s+/);
            const firstName = nameParts[0] || 'Admin';
            const lastName = nameParts.slice(1).join(' ') || 'User';

            await db.collection('users').insertOne({
              organizationId: org._id,
              firstName,
              lastName,
              email: emailLower,
              mobile: legacyAdmin.mobile || '+10000000000',
              passwordHash: legacyAdmin.passwordHash,
              role: 'admin',
              emailVerified: true,
              mobileVerified: true,
              status: 'active',
              permissionOverrides: [],
              createdAt: legacyAdmin.createdAt || new Date(),
              updatedAt: legacyAdmin.updatedAt || new Date()
            });
            console.log(`[MIGRATION] Migrated admin "${legacyAdmin.name}" (${emailLower}) to unified User collection.`);
          } else {
            // Update role to admin if it's not already
            if (userExists.role !== 'admin') {
              await db.collection('users').updateOne(
                { _id: userExists._id },
                { $set: { role: 'admin' } }
              );
              console.log(`[MIGRATION] Updated existing user "${emailLower}" role to admin.`);
            }
          }
        }

        // Clean up or drop legacy admins collection so this only runs once
        try {
          await db.collection('admins').drop();
          console.log('[MIGRATION] Dropped legacy admins collection successfully.');
        } catch (dropErr) {
          console.error('[MIGRATION ERROR] Failed to drop legacy admins collection:', dropErr.message);
        }
      }
    }

    // Clean up/remove Reference Code dynamic fields
    const deleteResult = await DynamicField.deleteMany({
      $or: [
        { name: { $in: ['reference_code', 'referenceCode'] } },
        { label: { $regex: /reference code/i } }
      ]
    });
    if (deleteResult.deletedCount > 0) {
      console.log(`[CLEANUP] Deleted ${deleteResult.deletedCount} Reference Code dynamic field definitions.`);
    }
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
