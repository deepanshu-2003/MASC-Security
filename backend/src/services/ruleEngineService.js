import RoutePermission from '../models/RoutePermission.js';
import UserSet from '../models/UserSet.js';
import mongoose from 'mongoose';

/**
 * Evaluates route-level access rules for a specific user.
 * Mode action:
 * - "block": Deny access to matching targets, allow all others.
 * - "allow": Grant access to matching targets, deny all others.
 * Returns boolean (true = allowed, false = blocked)
 */
export const evaluateRouteAccess = async (path, user) => {
  const role = user.role;
  const userId = user._id;

  // Absolute Admin Bypass: Administrators can never be blocked by any route rules!
  if (role === 'admin') {
    return true;
  }

  // Retrieve user sets the user belongs to
  const userSets = await UserSet.find({ members: new mongoose.Types.ObjectId(userId) });
  const userSetIds = userSets.map(us => us._id.toString());

  // Find RoutePermission policy
  const rule = await RoutePermission.findOne({
    organizationId: user.organizationId,
    path: path
  });

  // If no custom rule is configured in DB, apply Default Rules
  if (!rule) {
    if (path.startsWith('/admin') && !['admin', 'manager'].includes(role)) {
      return false; // Admins/managers only
    }
    return true; // Default allow for other routes
  }

  // Check if current user matches users, userSets, or roles
  const matchesUser = (rule.users || []).some(id => id.toString() === userId.toString());
  const matchesUserSet = (rule.userSets || []).some(id => userSetIds.includes(id.toString()));
  const matchesRole = (rule.roles || []).includes(role);
  const isTargeted = matchesUser || matchesUserSet || matchesRole;

  if (rule.action === 'allow') {
    return isTargeted; // Only allow if targeted
  } else {
    return !isTargeted; // Block if targeted, otherwise allow
  }
};
