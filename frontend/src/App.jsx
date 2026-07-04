import React, { useState, useEffect } from 'react'
import {
  useMascAuth,
  MascThemeProvider,
  MascSetupWizard,
  MascAdminLogin,
  MascUserLogin,
  MascUserRegister,
  MascForgotPassword,
  MascResetPassword,
  MascToastProvider,
  useMascToast
} from './sdk'
import { MascDynamicForm } from './sdk/MascDynamicForm'
import './App.css'

// API base URL - configured via VITE_API_BASE_URL environment variable
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'

// Helper to convert messy User-Agent string into a clean readable device name
const getCleanDevice = (log) => {
  if (!log) return 'Unknown Device';
  if (log.details && log.details.deviceName) {
    return log.details.deviceName;
  }
  if (log.details && log.details.browser && log.details.os) {
    return `${log.details.browser} on ${log.details.os}`;
  }
  const ua = (log.userAgent || '').toLowerCase();
  if (!ua) return 'Unknown Device';
  
  let browser = 'Chrome';
  if (ua.includes('brave')) browser = 'Brave';
  else if (ua.includes('edg/') || ua.includes('edge/')) browser = 'Edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  
  let os = 'Windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('linux')) os = 'Linux';
  
  return `${browser} on ${os}`;
};

// Phase 8: Helper component to trigger toasts safely inside MascToastProvider
function MascSecurityToastAlerts({ userSessions, userSessionToken }) {
  const { addToast } = useMascToast()
  const [notifiedSessions, setNotifiedSessions] = useState(new Set())

  useEffect(() => {
    if (userSessions && userSessions.length > 0 && userSessionToken) {
      const activeSession = userSessions.find(s => s.sessionToken === userSessionToken && s.status === 'active')
      if (activeSession && activeSession.riskScore >= 31) {
        if (!notifiedSessions.has(activeSession._id)) {
          if (activeSession.riskScore >= 61) {
            addToast('Anomalous device activity logged. High session risk index.', 'error')
          } else {
            addToast('Verify login parameters. Moderate credentials drift detected.', 'warning')
          }
          setNotifiedSessions(prev => {
            const next = new Set(prev)
            next.add(activeSession._id)
            return next
          })
        }
      }
    }
  }, [userSessions, userSessionToken, addToast, notifiedSessions])

  return null
}

function App() {
  const { addToast } = useMascToast()
  const {
    admin,
    organization,
    token,
    setupRequired,
    setupCredentials,
    setSetupCredentials,
    loading,
    error,
    login: adminLogin,
    logout: adminLogout,
    runSetupWizard,
    updateBranding,
    setAdmin,
    verifyAdminOtp,
    sessionExpiredReason,
    clearSessionExpiredReason
  } = useMascAuth()

  // User Authentication State
  const [user, setUser] = useState(null)
  const [userToken, setUserToken] = useState(null)
  const [userSessionToken, setUserSessionToken] = useState(null) // Phase 4: Session token
  const [userSessions, setUserSessions] = useState([]) // Phase 4: Active sessions list
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  // Navigation & View States
  const [portalMode, setPortalMode] = useState('admin') // 'admin' or 'user'
  const [userView, setUserView] = useState('login') // 'login', 'register', 'forgot', 'reset'
  const [resetToken, setResetToken] = useState(null)

  const [brandEdit, setBrandEdit] = useState({
    name: '',
    primaryGradientStart: '',
    primaryGradientEnd: '',
    secondaryGradientStart: '',
    secondaryGradientEnd: '',
    accentColor: '',
    vaultMode: false,
    maxVerificationAttempts: 3,
    lowRiskPolicy: 'allow',
    mediumRiskPolicy: 'allow',
    highRiskPolicy: 'block',
    verifySessionOnEachRequest: false
  })
  
  const [editSuccess, setEditSuccess] = useState('')
  const [editError, setEditError] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Admin Portal Tab State
  const [adminTab, setAdminTab] = useState('branding') // 'branding', 'roles', 'users', 'logs', 'sessions'
  
  // Admin Sessions state (Phase 4)
  const [adminSessions, setAdminSessions] = useState([])
  const [adminSessionsLoading, setAdminSessionsLoading] = useState(false)
  const [adminSessionsError, setAdminSessionsError] = useState('')
  
  // Admin Data states
  const [roles, setRoles] = useState([])
  const [usersList, setUsersList] = useState([])
  const [auditLogs, setAuditLogs] = useState([])

  // Dashboard stats state (active users, active sessions, risk events)
  const [dashboardStats, setDashboardStats] = useState({
    activeUsersCount: 0,
    activeSessionsCount: 0,
    riskEventsCount: 0
  })

  // Vault Governance state
  const [vaultClusters, setVaultClusters] = useState([])
  const [vaultCollections, setVaultCollections] = useState([])
  const [vaultUserSets, setVaultUserSets] = useState([])
  const [vaultBlockRules, setVaultBlockRules] = useState([])
  const [vaultGovLoading, setVaultGovLoading] = useState(false)
  const [vaultGovError, setVaultGovError] = useState('')
  const [vaultGovSuccess, setVaultGovSuccess] = useState('')
  const [vaultGovSubTab, setVaultGovSubTab] = useState('overview') // 'overview' | 'collections' | 'user-sets' | 'blocks' | 'audit'
  const [vaultAuditLogs, setVaultAuditLogs] = useState([])
  const [vaultAuditLoading, setVaultAuditLoading] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [collectionRecords, setCollectionRecords] = useState([])
  const [collectionRecordsLoading, setCollectionRecordsLoading] = useState(false)
  // Override form state for permissions matrix
  const [overrideForm, setOverrideForm] = useState({ granteeType: 'user', granteeId: '' })
  // Block rule form state
  const [blockForm, setBlockForm] = useState({ targetType: 'user', targetId: '', collectionId: '' })
  const [newUserSetName, setNewUserSetName] = useState('')
  const [newUserSetMembers, setNewUserSetMembers] = useState('')
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [selectedRecordDetails, setSelectedRecordDetails] = useState(null)
  const [selectedRecordLoading, setSelectedRecordLoading] = useState(false)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [newClusterName, setNewClusterName] = useState('')
  const [newClusterDesc, setNewClusterDesc] = useState('')
  const [newClusterScope, setNewClusterScope] = useState('global')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionClusterId, setNewCollectionClusterId] = useState('')



  // Role Form states
  const [editingRole, setEditingRole] = useState(null) // null for Create
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: [
      { resource: 'vault', access: 'deny' }
    ]
  })
  const [roleSuccess, setRoleSuccess] = useState('')
  const [roleError, setRoleError] = useState('')

  // User override editing states
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserLogs, setSelectedUserLogs] = useState([])
  const [userLogsModalOpen, setUserLogsModalOpen] = useState(false)
  const [selectedUserForLogs, setSelectedUserForLogs] = useState(null)
  const [userRoleSelect, setUserRoleSelect] = useState('')
  const [flushModalOpen, setFlushModalOpen] = useState(false)
  const [flushTarget, setFlushTarget] = useState('low-risk')
  const [flushUserId, setFlushUserId] = useState('')
  const [flushPassword, setFlushPassword] = useState('')
  const [flushLoading, setFlushLoading] = useState(false)
  const [userOverridesForm, setUserOverridesForm] = useState({
    vault: 'inherit'
  })
  const [userOverrideSuccess, setUserOverrideSuccess] = useState('')
  const [userOverrideError, setUserOverrideError] = useState('')
  const [selectedUserVault, setSelectedUserVault] = useState(null)
  const [selectedUserVaultLoading, setSelectedUserVaultLoading] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [selectedUserCustomFields, setSelectedUserCustomFields] = useState(null)
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false)
  const [editUserForm, setEditUserForm] = useState({})
  const [selectedUserLastSession, setSelectedUserLastSession] = useState(null)


  // AI model training states
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingSummary, setTrainingSummary] = useState(null)
  const [trainingError, setTrainingError] = useState('')

  // Member Dashboard states
  const [userTab, setUserTab] = useState('profile') // 'profile', 'vault', 'courses', 'attendance', 'sessions'
  const [tabData, setTabData] = useState(null)
  const [tabError, setTabError] = useState('')
  const [tabLoading, setTabLoading] = useState(false)

  // Phase 6: Member Profile Dynamic Fields states
  const [profileFields, setProfileFields] = useState([])
  const [profileValues, setProfileValues] = useState({})
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')

  // Phase 6: Admin Dynamic Fields management states
  const [adminFields, setAdminFields] = useState([])
  const [adminFieldsLoading, setAdminFieldsLoading] = useState(false)
  const [adminFieldsError, setAdminFieldsError] = useState('')
  const [adminFieldsSuccess, setAdminFieldsSuccess] = useState('')

  // Phase 8: AI Security Hub States
  const [aiSummary, setAiSummary] = useState(null)
  const [aiAlerts, setAiAlerts] = useState([])
  const [aiRecs, setAiRecs] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiSuccess, setAiSuccess] = useState('')

  // Admin Field Form states
  const [editingFieldId, setEditingFieldId] = useState(null)
  const [showFieldForm, setShowFieldForm] = useState(false)
  const [fieldFormData, setFieldFormData] = useState({
    name: '',
    label: '',
    type: 'text',
    required: false,
    readOnly: false,
    hidden: false,
    placeholder: '',
    description: '',
    defaultValue: '',
    options: '',
    validationMinLength: '',
    validationMaxLength: '',
    validationPattern: '',
    validationMin: '',
    validationMax: '',
    securityStoreType: 'normal',
    securityMaskValue: false,
    securityShowHideToggle: false,
    placement: 'profile',
    status: 'active',
    order: 0
  })

  // Import payload
  const [importJson, setImportJson] = useState('')
  const [showImportArea, setShowImportArea] = useState(false)

  // Custom Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: 'Confirm Action',
    message: '',
    onConfirm: null,
    confirmText: 'Proceed',
    cancelText: 'Cancel',
    isDanger: false
  })

  const triggerConfirm = (message, onConfirm, options = {}) => {
    setConfirmDialog({
      isOpen: true,
      title: options.title || 'Confirm Action',
      message,
      onConfirm: () => {
        onConfirm()
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
      },
      confirmText: options.confirmText || 'Proceed',
      cancelText: options.cancelText || 'Cancel',
      isDanger: !!options.isDanger
    })
  }
  // Admin Profile Password Change States
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('')
  const [adminProfileSuccess, setAdminProfileSuccess] = useState('')
  const [adminProfileError, setAdminProfileError] = useState('')
  // AI Security Report Modal State
  const [selectedSessionForAiReport, setSelectedSessionForAiReport] = useState(null)

  // Enterprise Vault & Access Control System tab states
  const [applications, setApplications] = useState([])
  const [apiKeys, setApiKeys] = useState([])
  const [routeRules, setRouteRules] = useState([])

  const [newAppName, setNewAppName] = useState('')
  const [keyGenAppId, setKeyGenAppId] = useState('')
  const [generatedSecretModal, setGeneratedSecretModal] = useState(null)

  // Route Rule form state
  const [routeRuleForm, setRouteRuleForm] = useState({
    path: '',
    action: 'block',
    users: [],
    userSets: [],
    roles: []
  })

  const [rulesSuccess, setRulesSuccess] = useState('')
  const [rulesError, setRulesError] = useState('')
  // Check URL query parameters on load for reset token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tkn = params.get('resetToken')
    if (tkn) {
      setResetToken(tkn)
      setPortalMode('user')
      setUserView('reset')
    }

    const storedUser = localStorage.getItem('masc_user')
    const storedToken = localStorage.getItem('masc_user_token')
    const storedSessionToken = localStorage.getItem('masc_session_token')
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser))
      setUserToken(storedToken)
      if (storedSessionToken) setUserSessionToken(storedSessionToken)
    }
  }, [])

  // Get active session risk details
  const activeSessionWithRisk = userSessions.find(s => s.sessionToken === userSessionToken && s.status === 'active');
  const sessionRiskScore = activeSessionWithRisk ? activeSessionWithRisk.riskScore : 0;

  // Fetch dashboard statistics
  const fetchDashboardStats = async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setDashboardStats(data)
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err)
    }
  }

  // Fetch Vault Governance data (clusters, collections, user-sets, block-rules)
  const fetchVaultGovernance = async () => {
    if (!token) return
    setVaultGovLoading(true)
    
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [clustersRes, collectionsRes, userSetsRes, blockRulesRes] = await Promise.all([
        fetch(`${API_BASE}/vault/admin/clusters`, { headers }),
        fetch(`${API_BASE}/vault/admin/collections`, { headers }),
        fetch(`${API_BASE}/vault/admin/user-sets`, { headers }),
        fetch(`${API_BASE}/vault/admin/block-rules`, { headers })
      ])
      const [cd, cod, usd, brd] = await Promise.all([
        clustersRes.json(), collectionsRes.json(), userSetsRes.json(), blockRulesRes.json()
      ])
      if (cd.success) setVaultClusters(cd.clusters || [])
      if (cod.success) setVaultCollections(cod.collections || [])
      if (usd.success) setVaultUserSets(usd.userSets || [])
      if (brd.success) setVaultBlockRules(brd.rules || [])
    } catch (err) {
      addToast('Failed to load vault governance data: ' + err.message, 'error')
    } finally {
      setVaultGovLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCluster) {
      const fresh = vaultClusters.find(c => c._id === selectedCluster._id)
      if (fresh) setSelectedCluster(fresh)
    }
  }, [vaultClusters])

  useEffect(() => {
    if (selectedCollection) {
      const fresh = vaultCollections.find(c => c._id === selectedCollection._id)
      if (fresh) setSelectedCollection(fresh)
    }
  }, [vaultCollections])

  const fetchVaultAuditLogs = async () => {
    if (!token) return
    setVaultAuditLoading(true)
    try {
      const res = await fetch(`${API_BASE}/vault/vault-audit-logs`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setVaultAuditLogs(data.logs || [])
    } catch (err) { console.error('Vault audit logs error:', err) }
    finally { setVaultAuditLoading(false) }
  }

  const fetchCollectionRecords = async (collectionId) => {
    setCollectionRecordsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/vault/admin/collections/${collectionId}/records`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setCollectionRecords(data.records || [])
    } catch (err) { console.error('Fetch records error:', err) }
    finally { setCollectionRecordsLoading(false) }
  }

  const fetchRecordDetails = async (recordId) => {
    setSelectedRecordLoading(true)
    setSelectedRecordDetails(null)
    try {
      const res = await fetch(`${API_BASE}/vault/admin/records/${recordId}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data.success) {
        setSelectedRecordDetails(data.record)
      } else {
        addToast(data.error || 'Failed to fetch decrypted record data.', 'error')
      }
    } catch (err) {
      console.error('Fetch record details error:', err)
      addToast(err.message, 'error')
    } finally {
      setSelectedRecordLoading(false)
    }
  }

  const handleCheckboxChange = async (resourceType, resourceId, granteeType, granteeId, action, currentActions, active) => {
    try {
      const endpoint = active ? 'grant' : 'revoke'
      const res = await fetch(`${API_BASE}/vault/permissions/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          resourceType,
          resourceId,
          granteeType,
          granteeId,
          actions: [action]
        })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Permission ${active ? 'granted' : 'revoked'} successfully!`, 'success')
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to update permissions', 'error')
      }
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const handleAddOverride = async (resourceType, resourceId) => {
    if (!overrideForm.granteeId) {
      addToast('Please select a grantee first.', 'warning')
      return
    }

    let finalGranteeType = overrideForm.granteeType;
    if (resourceType === 'cluster') {
      const parentCluster = vaultClusters.find(c => c._id === resourceId) || selectedCluster;
      if (parentCluster?.scopeType === 'local') {
        finalGranteeType = 'role';
      }
    } else if (resourceType === 'collection') {
      const collection = vaultCollections.find(c => c._id === resourceId) || selectedCollection;
      const clusterId = collection?.clusterId?._id || collection?.clusterId;
      const parentCluster = vaultClusters.find(c => c._id === clusterId) || selectedCluster;
      if (parentCluster?.scopeType === 'local') {
        finalGranteeType = 'role';
      }
    }

    // Manager security check for adding overrides
    if (admin?.role === 'manager') {
      if (finalGranteeType === 'user') {
        const u = usersList.find(usr => usr._id === overrideForm.granteeId);
        if (u && (u.role === 'manager' || u.email === admin?.email || u._id === admin?._id)) {
          addToast('Managers are not allowed to configure overrides targeting manager accounts.', 'error');
          return;
        }
      }
      if (finalGranteeType === 'userSet') {
        const fullSet = vaultUserSets.find(set => set._id === overrideForm.granteeId);
        const containsManager = fullSet && fullSet.members && fullSet.members.some(memberId => {
          const memberUserObj = usersList.find(usr => usr._id === memberId || usr._id === (memberId?._id || memberId));
          if (!memberUserObj) return false;
          const isSelf = memberUserObj.email === admin?.email || memberUserObj._id === admin?._id;
          const isManager = memberUserObj.role === 'manager';
          return isSelf || isManager;
        });
        if (containsManager) {
          addToast('Managers are not allowed to configure overrides targeting a User Set containing manager accounts.', 'error');
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE}/vault/permissions/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          resourceType,
          resourceId,
          granteeType: finalGranteeType,
          granteeId: overrideForm.granteeId,
          // By default all permissions must be allowed
          actions: ['read', 'create', 'update', 'delete']
        })
      })
      const data = await res.json()
      if (res.ok) {
        addToast('Grantee override added successfully with all permissions enabled.', 'success')
        setOverrideForm(p => ({ ...p, granteeId: '' }))
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to add override', 'error')
      }
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const handleRemoveOverride = async (resourceType, resourceId, granteeType, granteeId, actions) => {
    try {
      const res = await fetch(`${API_BASE}/vault/permissions/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          resourceType,
          resourceId,
          granteeType,
          granteeId,
          actions
        })
      })
      const data = await res.json()
      if (res.ok) {
        addToast('Grantee override removed successfully.', 'success')
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to remove override', 'error')
      }
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const handleAddBlockRule = async () => {
    
    

    // Manager block validation
    if (admin?.role === 'manager') {
      if (blockForm.targetType === 'user') {
        const u = usersList.find(usr => usr._id === blockForm.targetId);
        if (u && (u.role === 'manager' || u.email === admin?.email || u._id === admin?._id)) {
          addToast('Managers are not allowed to configure blocks targeting manager accounts.', 'error');
          return;
        }
      }
      if (blockForm.targetType === 'userSet') {
        const fullSet = vaultUserSets.find(set => set._id === blockForm.targetId);
        const containsManager = fullSet && fullSet.members && fullSet.members.some(memberId => {
          const memberUserObj = usersList.find(usr => usr._id === memberId || usr._id === (memberId?._id || memberId));
          if (!memberUserObj) return false;
          const isSelf = memberUserObj.email === admin?.email || memberUserObj._id === admin?._id;
          const isManager = memberUserObj.role === 'manager';
          return isSelf || isManager;
        });
        if (containsManager) {
          addToast('Managers are not allowed to configure blocks targeting a User Set containing manager accounts.', 'error');
          return;
        }
      }
    }

    try {
      const body = { targetType: blockForm.targetType, targetId: blockForm.targetId }
      if (blockForm.collectionId) body.collectionId = blockForm.collectionId
      const res = await fetch(`${API_BASE}/vault/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        addToast('Block rule created!', 'success')
        setBlockForm({ targetType: 'user', targetId: '', collectionId: '' })
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to create block rule', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleRemoveBlockRule = async (rule) => {
    
    

    // Manager remove block validation
    if (admin?.role === 'manager') {
      if (rule.targetType === 'user') {
        const u = usersList.find(usr => usr._id === rule.targetId);
        if (u && (u.role === 'manager' || u.email === admin?.email || u._id === admin?._id)) {
          addToast('Managers are not allowed to modify blocks targeting manager accounts.', 'error');
          return;
        }
      }
      if (rule.targetType === 'userSet') {
        const fullSet = vaultUserSets.find(set => set._id === rule.targetId);
        const containsManager = fullSet && fullSet.members && fullSet.members.some(memberId => {
          const memberUserObj = usersList.find(usr => usr._id === memberId || usr._id === (memberId?._id || memberId));
          if (!memberUserObj) return false;
          const isSelf = memberUserObj.email === admin?.email || memberUserObj._id === admin?._id;
          const isManager = memberUserObj.role === 'manager';
          return isSelf || isManager;
        });
        if (containsManager) {
          addToast('Managers are not allowed to modify blocks targeting a User Set containing manager accounts.', 'error');
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE}/vault/blocks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType: rule.targetType, targetId: rule.targetId, collectionId: rule.collectionId })
      })
      if (res.ok) {
        addToast('Block rule removed!', 'success')
        fetchVaultGovernance()
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to remove block rule', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleCreateCluster = async () => {
    
    
    try {
      const res = await fetch(`${API_BASE}/vault/admin/clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newClusterName,
          description: newClusterDesc,
          scopeType: newClusterScope
        })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Cluster "${newClusterName}" created successfully!`, 'success')
        setNewClusterName('')
        setNewClusterDesc('')
        setNewClusterScope('global')
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to create cluster', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleCreateCollection = async () => {
    
    
    try {
      const res = await fetch(`${API_BASE}/vault/admin/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clusterId: newCollectionClusterId,
          name: newCollectionName
        })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Collection "${newCollectionName}" created successfully!`, 'success')
        setNewCollectionName('')
        setNewCollectionClusterId('')
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to create collection', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleToggleClusterBlock = async (clusterId, currentBlocked) => {
    
    
    try {
      const action = currentBlocked ? 'unblock' : 'block'
      const res = await fetch(`${API_BASE}/vault/admin/clusters/${clusterId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Cluster ${currentBlocked ? 'unblocked' : 'blocked'} successfully!`, 'success')
        if (selectedCluster && selectedCluster._id === clusterId) {
          setSelectedCluster(data.cluster)
        }
        fetchVaultGovernance()
      } else {
        addToast(data.error || `Failed to ${action} cluster`, 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleToggleCollectionBlock = async (collectionId, currentBlocked) => {
    
    
    try {
      const action = currentBlocked ? 'unblock' : 'block'
      const res = await fetch(`${API_BASE}/vault/admin/collections/${collectionId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Collection ${currentBlocked ? 'unblocked' : 'blocked'} successfully!`, 'success')
        if (selectedCollection && selectedCollection._id === collectionId) {
          setSelectedCollection(data.collection)
        }
        fetchVaultGovernance()
      } else {
        addToast(data.error || `Failed to ${action} collection`, 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }


  const handleCreateUserSet = async () => {
    
    
    const memberIds = newUserSetMembers.split(',').map(s => s.trim()).filter(Boolean)
    try {
      const res = await fetch(`${API_BASE}/vault/admin/user-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newUserSetName, members: memberIds })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`User Set "${newUserSetName}" created!`, 'success')
        setNewUserSetName('')
        setNewUserSetMembers('')
        fetchVaultGovernance()
      } else {
        addToast(data.error || 'Failed to create user set', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleDeleteUserSet = async (userSetId, name) => {
    triggerConfirm(
      `Delete User Set "${name}"? This will remove all its members and associated permissions.`,
      async () => {
        try {
          const res = await fetch(`${API_BASE}/vault/admin/user-sets/${userSetId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            addToast('User Set deleted!', 'success')
            fetchVaultGovernance()
          }
        } catch (err) { addToast(err.message, 'error') }
      },
      { title: 'Delete User Set', confirmText: 'Delete', isDanger: true }
    )
  }

  const handleRemoveUserFromSet = async (userSetId, userId) => {
    try {
      const res = await fetch(`${API_BASE}/vault/admin/user-sets/${userSetId}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        addToast('Member removed from User Set!', 'success')
        fetchVaultGovernance()
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  // Fetch admin roles
  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE}/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setRoles(data)
    } catch (err) {
      console.error('Error fetching roles:', err)
    }
  }

  // Fetch admin users
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setUsersList(data)
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  // Fetch security audit logs
  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setAuditLogs(data)
    } catch (err) {
      console.error('Error fetching audit logs:', err)
    }
  }

  const handleFlushLogs = async (e) => {
    e.preventDefault();
    if (!flushPassword) {
      addToast('Please enter your administrator password.', 'error');
      return;
    }
    setFlushLoading(true);
    try {
      const res = await fetch(`${API_BASE}/audit-logs/flush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          target: flushTarget,
          userId: flushTarget === 'user' ? flushUserId : undefined,
          password: flushPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to flush logs');
      addToast(data.message || 'Logs flushed successfully!', 'success');
      setFlushModalOpen(false);
      setFlushPassword('');
      setFlushUserId('');
      fetchAuditLogs();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setFlushLoading(false);
    }
  };

  // Fetch audit logs filtered by a single user
  const viewUserLogs = async (userObj) => {
    setSelectedUserForLogs(userObj)
    setUserLogsModalOpen(true)
    setSelectedUserLogs([])
    try {
      const res = await fetch(`${API_BASE}/audit-logs?email=${encodeURIComponent(userObj.email)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setSelectedUserLogs(data)
    } catch (err) {
      console.error('Error fetching user audit logs:', err)
    }
  }

  // Phase 4: Fetch all user sessions (admin view)
  const fetchAdminSessions = async () => {
    setAdminSessionsLoading(true)
    setAdminSessionsError('')
    try {
      const res = await fetch(`${API_BASE}/sessions/admin/all?status=active`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setAdminSessions(data.sessions || [])
      else setAdminSessionsError(data.error || 'Failed to fetch sessions')
    } catch (err) {
      setAdminSessionsError('Network error: ' + err.message)
    } finally {
      setAdminSessionsLoading(false)
    }
  }

  // Phase 8: Fetch platform AI threat and recommendation data
  const fetchAiData = async () => {
    if (!token) return
    setAiLoading(true)
    
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [resSummary, resAlerts, resRecs] = await Promise.all([
        fetch(`${API_BASE}/ai/summary`, { headers }),
        fetch(`${API_BASE}/ai/alerts`, { headers }),
        fetch(`${API_BASE}/ai/recommendations`, { headers })
      ])

      const summaryData = await resSummary.json()
      const alertsData = await resAlerts.json()
      const recsData = await resRecs.json()

      if (resSummary.ok && resAlerts.ok && resRecs.ok) {
        setAiSummary(summaryData)
        setAiAlerts(alertsData)
        setAiRecs(recsData)
      } else {
        addToast('Failed to fetch AI safety metrics.', 'error')
      }
    } catch (err) {
      addToast('Network error while pulling AI metrics: ' + err.message, 'error')
    } finally {
      setAiLoading(false)
    }
  }

  // Phase 8: Resolve/dismiss AI alerts
  const handleUpdateAlertStatus = async (alertId, newStatus) => {
    
    
    try {
      const res = await fetch(`${API_BASE}/ai/alerts/${alertId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Alert status updated to ${newStatus}.`, 'success')
        fetchAiData()
      } else {
        addToast(data.message || 'Failed to update alert status.', 'error')
      }
    } catch (err) {
      addToast('Failed to update alert: ' + err.message, 'error')
    }
  }

  // Save AI threat access control policies
  const handlePolicySave = async (e) => {
    if (e) e.preventDefault()
    
    
    try {
      const res = await fetch(`${API_BASE}/branding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lowRiskPolicy: brandEdit.lowRiskPolicy,
          mediumRiskPolicy: brandEdit.mediumRiskPolicy,
          highRiskPolicy: brandEdit.highRiskPolicy,
          verifySessionOnEachRequest: brandEdit.verifySessionOnEachRequest,
          allowConcurrentSessions: brandEdit.allowConcurrentSessions,
          requirePhysicalLocation: brandEdit.requirePhysicalLocation,
          sessionTimeoutHours: brandEdit.sessionTimeoutHours
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update policy')
      }
      addToast('Access control threat policies updated successfully!', 'success')
      addToast('Access control threat policies updated successfully!', 'success')
      if (organization) {
        Object.assign(organization, data)
      }
    } catch (err) {
      addToast(err.message, 'error')
      addToast(err.message, 'error')
    }
  }

  // Trigger custom AI training job using Python virtual environment trainer
  const handleTrainModel = async () => {
    setTrainingLoading(true)
    setTrainingError('')
    try {
      const res = await fetch(`${API_BASE}/ai/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      const data = await res.json()
      if (res.ok) {
        setTrainingSummary(data.summary)
        addToast('AI Threat Model re-trained successfully on 1,000+ vectors!', 'success')
      } else {
        throw new Error(data.error || 'Failed to train AI model')
      }
    } catch (err) {
      setTrainingError(err.message)
      addToast(err.message, 'error')
    } finally {
      setTrainingLoading(false)
    }
  }

  // --- Developer App & API Key Access Control handlers ---
  const fetchApplications = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/applications`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data.success) setApplications(data.applications || [])
    } catch (err) { console.error('Fetch applications error:', err) }
  }

  const fetchApiKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/api-keys`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data.success) setApiKeys(data.apiKeys || [])
    } catch (err) { console.error('Fetch api keys error:', err) }
  }

  const handleCreateApplication = async (e) => {
    if (e) e.preventDefault()
    
    
    if (!newAppName.trim()) return
    try {
      const res = await fetch(`${API_BASE}/admin/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newAppName.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`Application "${newAppName}" created successfully!`, 'success')
        setNewAppName('')
        fetchApplications()
      } else {
        addToast(data.error || 'Failed to create application', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleDeleteApplication = async (appId, appName) => {
    triggerConfirm(
      `Are you sure you want to delete application "${appName}"? This will revoke and delete ALL associated API keys!`,
      async () => {
        
        
        try {
          const res = await fetch(`${API_BASE}/admin/applications/${appId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
          const data = await res.json()
          if (res.ok) {
            addToast('Application and keys deleted!', 'success')
            fetchApplications()
            fetchApiKeys()
          } else {
            addToast(data.error || 'Failed to delete application', 'error')
          }
        } catch (err) { addToast(err.message, 'error') }
      },
      { title: 'Delete Application', confirmText: 'Delete', isDanger: true }
    )
  }

  const handleGenerateApiKey = async (e) => {
    if (e) e.preventDefault()
    
    
    if (!keyGenAppId) {
      addToast('Please select an application first.', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/admin/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId: keyGenAppId })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast('New API Key pair generated successfully!', 'success')
        setGeneratedSecretModal({
          apiKey: data.apiKey.apiKey,
          apiSecret: data.apiKey.apiSecret,
          action: 'generate'
        })
        setKeyGenAppId('')
        fetchApiKeys()
      } else {
        addToast(data.error || 'Failed to generate API Key', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleRotateApiKey = async (keyId) => {
    triggerConfirm(
      `Are you sure you want to rotate this API Key? The previous secret will stop working IMMEDIATELY.`,
      async () => {
        
        
        try {
          const res = await fetch(`${API_BASE}/admin/api-keys/${keyId}/rotate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          })
          const data = await res.json()
          if (res.ok && data.success) {
            addToast('API Key rotated successfully!', 'success')
            setGeneratedSecretModal({
              apiKey: data.apiKey.apiKey,
              apiSecret: data.apiKey.apiSecret,
              action: 'rotate'
            })
            fetchApiKeys()
          } else {
            addToast(data.error || 'Failed to rotate API Key', 'error')
          }
        } catch (err) { addToast(err.message, 'error') }
      },
      { title: 'Rotate API Key', confirmText: 'Rotate Secret', isDanger: true }
    )
  }

  const handleDeleteApiKey = async (keyId) => {
    triggerConfirm(
      `Are you sure you want to revoke and delete this API Key?`,
      async () => {
        
        
        try {
          const res = await fetch(`${API_BASE}/admin/api-keys/${keyId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
          const data = await res.json()
          if (res.ok) {
            addToast('API Key revoked successfully.', 'success')
            fetchApiKeys()
          } else {
            addToast(data.error || 'Failed to revoke API Key', 'error')
          }
        } catch (err) { addToast(err.message, 'error') }
      },
      { title: 'Revoke API Key', confirmText: 'Revoke', isDanger: true }
    )
  }

  // --- Route Rules handlers ---
  const fetchRouteRules = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/route-rules`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data.success) setRouteRules(data.rules || [])
    } catch (err) { console.error('Fetch route rules error:', err) }
  }

  const handleSaveRouteRule = async (e) => {
    if (e) e.preventDefault()
    
    
    if (!routeRuleForm.path.trim()) {
      addToast('Path is required', 'error')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/admin/route-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(routeRuleForm)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast('Route permission rule saved successfully!', 'success')
        setRouteRuleForm({
          path: '',
          action: 'block',
          users: [],
          userSets: [],
          roles: []
        })
        fetchRouteRules()
      } else {
        addToast(data.error || 'Failed to save route rule', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  const handleDeleteRouteRule = async (ruleId) => {
    try {
      const res = await fetch(`${API_BASE}/admin/route-rules/${ruleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast('Route rule removed successfully.', 'success')
        fetchRouteRules()
      } else {
        addToast(data.error || 'Failed to delete route rule', 'error')
      }
    } catch (err) { addToast(err.message, 'error') }
  }

  // Trigger fetches when tab updates
  useEffect(() => {
    if (admin && token) {
      if (adminTab === 'branding') {
        fetchDashboardStats()
      } else if (adminTab === 'roles') {
        fetchRoles()
      } else if (adminTab === 'users') {
        fetchUsers()
        fetchRoles()
      } else if (adminTab === 'logs') {
        fetchAuditLogs()
      } else if (adminTab === 'sessions') {
        fetchAdminSessions()
      } else if (adminTab === 'fields') {
        fetchAdminFields()
      } else if (adminTab === 'ai-hub') {
        fetchAiData()
        if (organization) {
          setBrandEdit(prev => ({
            ...prev,
            lowRiskPolicy: organization.lowRiskPolicy || 'allow',
            mediumRiskPolicy: organization.mediumRiskPolicy || 'allow',
            highRiskPolicy: organization.highRiskPolicy || 'block',
            verifySessionOnEachRequest: organization.verifySessionOnEachRequest || false,
            allowConcurrentSessions: organization.allowConcurrentSessions !== undefined ? organization.allowConcurrentSessions : true,
            requirePhysicalLocation: organization.requirePhysicalLocation || false,
            sessionTimeoutHours: organization.sessionTimeoutHours || 24
          }))
        }
      } else if (adminTab === 'vault-governance') {
        fetchUsers()
        fetchRoles()
        fetchVaultGovernance()
      } else if (adminTab === 'api-keys') {
        fetchApplications()
        fetchApiKeys()
      } else if (adminTab === 'route-rules') {
        fetchRouteRules()
        fetchUsers()
        fetchVaultGovernance()
      }
    }
  }, [admin, token, adminTab])

  // Redirect managers from admin-only tabs to user control panel
  useEffect(() => {
    let adminOnlyTabs = ['branding', 'roles', 'fields', 'ai-hub', 'vault-governance', 'api-keys', 'route-rules'];
    if (organization?.managerPermissions?.canAccessVaultGovernance) {
      adminOnlyTabs = adminOnlyTabs.filter(t => t !== 'vault-governance');
    }
    if (organization?.managerPermissions?.canAccessRouteRules) {
      adminOnlyTabs = adminOnlyTabs.filter(t => t !== 'route-rules');
    }
    if (organization?.managerPermissions?.canAccessBranding) {
      adminOnlyTabs = adminOnlyTabs.filter(t => t !== 'branding');
    }
    if (admin && admin.role === 'manager' && adminOnlyTabs.includes(adminTab)) {
      setAdminTab('users')
    }
  }, [admin, adminTab, organization])

  // Phase 6: Member Profile Dynamic Fields fetching
  const fetchProfileDynamicFields = async () => {
    if (!userToken) return
    setProfileLoading(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      const resFields = await fetch(`${API_BASE}/dynamic-fields/placement/profile`)
      const dataFields = await resFields.json()
      if (!resFields.ok) throw new Error(dataFields.error || 'Failed to fetch profile fields')
      
      setProfileFields(dataFields.fields || [])

      const resValues = await fetch(`${API_BASE}/dynamic-fields/values`, {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      const dataValues = await resValues.json()
      if (!resValues.ok) throw new Error(dataValues.error || 'Failed to fetch user values')

      const seedValues = {};
      dataFields.fields.forEach(field => {
        seedValues[field.name] = dataValues.values?.[field.name]?.value !== undefined
          ? dataValues.values[field.name].value
          : (field.defaultValue || '');
      });
      setProfileValues(seedValues)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  // Phase 6: Member Profile Dynamic Fields save
  const saveProfileValues = async () => {
    if (!userToken) return
    setProfileSaving(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      const res = await fetch(`${API_BASE}/dynamic-fields/values`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ values: profileValues })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save details')
      }
      setProfileSuccess('Identity parameters updated successfully.')
      await fetchProfileDynamicFields()
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  // Phase 6: Admin Dynamic Fields CRUD Actions
  const fetchAdminFields = async () => {
    if (!token) return
    setAdminFieldsLoading(true)
    
    
    try {
      const res = await fetch(`${API_BASE}/dynamic-fields`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch dynamic fields')
      setAdminFields(data.fields || [])
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setAdminFieldsLoading(false)
    }
  }

  const handleSaveField = async (e) => {
    e.preventDefault();
    ;
    ;
    
    const validation = {};
    if (fieldFormData.validationMinLength) validation.minLength = Number(fieldFormData.validationMinLength);
    if (fieldFormData.validationMaxLength) validation.maxLength = Number(fieldFormData.validationMaxLength);
    if (fieldFormData.validationPattern) validation.pattern = fieldFormData.validationPattern;
    if (fieldFormData.validationMin) validation.min = Number(fieldFormData.validationMin);
    if (fieldFormData.validationMax) validation.max = Number(fieldFormData.validationMax);

    const security = {
      storeType: fieldFormData.securityStoreType,
      maskValue: !!fieldFormData.securityMaskValue,
      showHideToggle: !!fieldFormData.securityShowHideToggle
    };

    const optionsArray = fieldFormData.options
      ? fieldFormData.options.split('\n').map(o => o.trim()).filter(Boolean)
      : [];

    const payload = {
      name: fieldFormData.name,
      label: fieldFormData.label,
      type: fieldFormData.type,
      required: !!fieldFormData.required,
      readOnly: !!fieldFormData.readOnly,
      hidden: !!fieldFormData.hidden,
      placeholder: fieldFormData.placeholder,
      description: fieldFormData.description,
      defaultValue: fieldFormData.defaultValue,
      options: optionsArray,
      validation,
      placement: fieldFormData.placement,
      security,
      status: fieldFormData.status,
      order: Number(fieldFormData.order) || 0
    };

    try {
      const url = editingFieldId
        ? `${API_BASE}/dynamic-fields/${editingFieldId}`
        : `${API_BASE}/dynamic-fields`;
      const method = editingFieldId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save field');

      addToast(editingFieldId ? 'Field updated successfully.' : 'Field created successfully.', 'success');
      setShowFieldForm(false);
      fetchAdminFields();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteField = async (id) => {
    triggerConfirm(
      'Are you sure you want to delete this field? This will delete all user-submitted values for this field.',
      async () => {
        ;
        ;
        try {
          const res = await fetch(`${API_BASE}/dynamic-fields/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to delete field');
          addToast('Field definition and user values deleted.', 'success');
          fetchAdminFields();
        } catch (err) {
          addToast(err.message, 'error');
        }
      },
      { title: 'Delete Dynamic Field', confirmText: 'Yes, Delete', isDanger: true }
    );
  };

  const handleCloneField = async (id) => {
    ;
    ;
    try {
      const res = await fetch(`${API_BASE}/dynamic-fields/${id}/clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clone field');
      addToast('Field cloned successfully.', 'success');
      fetchAdminFields();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleMoveField = async (index, direction) => {
    const list = [...adminFields];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const orderings = list.map((item, idx) => ({
      id: item._id,
      order: idx
    }));

    setAdminFields(list);

    try {
      const res = await fetch(`${API_BASE}/dynamic-fields/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderings })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save order');
      }
    } catch (err) {
      addToast(err.message, 'error');
      fetchAdminFields();
    }
  };

  const handleExportFields = async () => {
    ;
    ;
    try {
      const res = await fetch(`${API_BASE}/dynamic-fields/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to export configuration');
      
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dynamic_fields_export.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Configurations exported successfully.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleImportFields = async () => {
    ;
    ;
    try {
      let parsedFields;
      try {
        parsedFields = JSON.parse(importJson);
      } catch (_) {
        throw new Error('Invalid JSON format. Please verify your input.');
      }

      const res = await fetch(`${API_BASE}/dynamic-fields/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fields: parsedFields })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      addToast(data.message, 'success');
      setShowImportArea(false);
      setImportJson('');
      fetchAdminFields();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Fetch Member Portal protected data
  const fetchProtectedResource = async (resource) => {
    setTabLoading(true)
    setTabError('')
    setTabData(null)
    try {
      const res = await fetch(`${API_BASE}/protected/${resource}`, {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch ${resource} data`)
      }
      setTabData(data.data)
    } catch (err) {
      setTabError(err.message)
    } finally {
      setTabLoading(false)
    }
  }

  useEffect(() => {
    if (user && userToken) {
      fetchUserSessions() // Monitor session risk score updates
      if (userTab !== 'profile') {
        fetchProtectedResource(userTab)
      } else {
        fetchProfileDynamicFields()
      }
    }
  }, [user, userToken, userTab])

  // Phase 4: Fetch user's active sessions
  const fetchUserSessions = async () => {
    if (!userToken) return
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const res = await fetch(`${API_BASE}/sessions/me`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-session-token': localStorage.getItem('masc_session_token') || ''
        }
      })
      const data = await res.json()
      if (res.ok) {
        setUserSessions(data.sessions || [])
      } else {
        setSessionsError(data.error || 'Failed to fetch sessions')
      }
    } catch (err) {
      setSessionsError('Network error: ' + err.message)
    } finally {
      setSessionsLoading(false)
    }
  }


  const handleUserLoginSuccess = (data) => {
    setUser(data.user)
    setUserToken(data.token)
    localStorage.setItem('masc_user', JSON.stringify(data.user))
    localStorage.setItem('masc_user_token', data.token)
    // Phase 4: Store session token
    if (data.sessionToken) {
      setUserSessionToken(data.sessionToken)
      localStorage.setItem('masc_session_token', data.sessionToken)
    }
    setUserTab('profile')
  }


  const handleUserLogout = () => {
    localStorage.removeItem('masc_user')
    localStorage.removeItem('masc_user_token')
    localStorage.removeItem('masc_session_token')
    setUser(null)
    setUserToken(null)
    setUserSessionToken(null)
    setUserSessions([])
    setUserTab('profile')
  }

  // --- Session Expiry Toast ---
  // When useMascAuth detects an expired/revoked session it sets sessionExpiredReason.
  // We consume it here to show a toast and reset the view to the login screen.
  useEffect(() => {
    if (sessionExpiredReason) {
      addToast(sessionExpiredReason, 'error')
      clearSessionExpiredReason()
      // Make sure user is returned to login view
      setPortalMode('user')
      setUserView('login')
      setUser(null)
      setUserToken(null)
      setUserSessionToken(null)
      setUserSessions([])
      setUserTab('profile')
    }
  }, [sessionExpiredReason])

  // --- Proactive Session Health Polling (60s interval) ---
  // Calls validate-session endpoint periodically to detect server-side expiry/revocation.
  useEffect(() => {
    if (!userToken) return
    const pollSession = async () => {
      try {
        const sessToken = localStorage.getItem('masc_session_token') || ''
        const res = await fetch(`${API_BASE}/auth/validate-session`, {
          headers: {
            Authorization: `Bearer ${userToken}`,
            'x-session-token': sessToken
          }
        })
        // If not valid, useMascAuth interceptor handles the logout + sets sessionExpiredReason
        if (!res.ok && res.status === 401) {
          // The fetch interceptor in useMascAuth will handle sign-out
          console.warn('[SESSION POLL] Session invalid, interceptor will handle logout.')
        }
      } catch (err) {
        // Network errors are silent — do not log out on connectivity issues
      }
    }

    // Poll immediately then every 60 seconds
    pollSession()
    const interval = setInterval(pollSession, 60 * 1000)
    return () => clearInterval(interval)
  }, [userToken])

  // --- Toggle user account status (Suspend / Reactivate) ---
  const handleUserStatusToggle = async (targetUser) => {
    const newStatus = targetUser.status === 'active' ? 'suspended' : 'active'
    const actionLabel = newStatus === 'active' ? 'reactivate' : 'suspend'
    
    triggerConfirm(
      `Are you sure you want to ${actionLabel} ${targetUser.firstName} ${targetUser.lastName}?`,
      async () => {
        try {
          const res = await fetch(`${API_BASE}/users/${targetUser._id}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to update user status')
          addToast(data.message, 'success')
          fetchUsers()
        } catch (err) {
          addToast(err.message, 'error')
        }
      },
      {
        title: `${newStatus === 'active' ? 'Reactivate' : 'Suspend'} User`,
        confirmText: `${newStatus === 'active' ? 'Reactivate' : 'Suspend'}`,
        isDanger: newStatus === 'suspended'
      }
    )
  }

  // --- Change Administrator / Manager Password ---
  const handleAdminPasswordChange = async (e) => {
    e.preventDefault();
    ;
    ;
    if (adminNewPassword !== adminConfirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: adminCurrentPassword,
          newPassword: adminNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      addToast('Admin password updated successfully!', 'success');
      setAdminCurrentPassword('');
      setAdminNewPassword('');
      setAdminConfirmPassword('');
      addToast('Password updated successfully!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
      addToast(err.message, 'error');
    }
  };

  // Sync brand editing form fields
  const startEditing = () => {
    if (organization) {
      setBrandEdit({
        name: organization.name || 'MASC Security',
        primaryGradientStart: organization.primaryGradientStart || '#7C3AED',
        primaryGradientEnd: organization.primaryGradientEnd || '#A855F7',
        secondaryGradientStart: organization.secondaryGradientStart || '#9333EA',
        secondaryGradientEnd: organization.secondaryGradientEnd || '#C084FC',
        accentColor: organization.accentColor || '#8B5CF6',
        vaultMode: organization.vaultMode || false,
        maxVerificationAttempts: organization.maxVerificationAttempts || 3,
        lowRiskPolicy: organization.lowRiskPolicy || 'allow',
        mediumRiskPolicy: organization.mediumRiskPolicy || 'allow',
        highRiskPolicy: organization.highRiskPolicy || 'block',
        verifySessionOnEachRequest: organization.verifySessionOnEachRequest || false
      })
      setIsEditing(true)
      
      
    }
  }

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target
    setBrandEdit((prev) => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }))
  }

  const saveBrandingChanges = async (e) => {
    e.preventDefault()
    
    
    try {
      await updateBranding(brandEdit)
      addToast('Branding settings updated successfully!', 'success')
      addToast('Branding updated successfully!', 'success')
      setTimeout(() => setIsEditing(false), 2000)
    } catch (err) {
      addToast(err.message || 'Failed to update branding settings', 'error')
      addToast(err.message || 'Failed to update branding settings', 'error')
    }
  }

  const handleRolePermChange = (resource, access) => {
    setRoleForm(prev => {
      const newPerms = prev.permissions.map(p => 
        p.resource === resource ? { ...p, access } : p
      )
      return { ...prev, permissions: newPerms }
    })
  }

  const saveRole = async (e) => {
    e.preventDefault()
    
    
    const url = editingRole 
      ? `${API_BASE}/roles/${editingRole._id}`
      : `${API_BASE}/roles`
    const method = editingRole ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(roleForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save role')
      addToast(`Role "${roleForm.name}" saved successfully!`, 'success')
      setRoleForm({
        name: '',
        description: '',
        permissions: [
          { resource: 'vault', access: 'deny' }
        ]
      })
      setEditingRole(null)
      fetchRoles()
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  const cloneRole = (role) => {
    setEditingRole(null)
    setRoleForm({
      name: `${role.name}_copy`,
      description: `Copy of ${role.description}`,
      permissions: role.permissions.map(p => ({ ...p }))
    })
    addToast(`Cloned role configurations from "${role.name}". Please edit parameters and name.`, 'success')
  }

  const editRole = (role) => {
    setEditingRole(role)
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: role.permissions.map(p => ({ ...p }))
    })
    
    
  }

  const deleteRole = async (role) => {
    if (role.isSystem) return
    triggerConfirm(
      `Are you sure you want to delete role "${role.name}"?`,
      async () => {
        try {
          const res = await fetch(`${API_BASE}/roles/${role._id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to delete role')
          addToast(`Role "${role.name}" deleted successfully.`, 'success')
          fetchRoles()
        } catch (err) {
          addToast(err.message, 'error')
        }
      },
      { title: 'Delete Role', confirmText: 'Yes, Delete', isDanger: true }
    )
  }

  const fetchSelectedUserVault = async (userId) => {
    setSelectedUserVaultLoading(true)
    setSelectedUserVault(null)
    try {
      const res = await fetch(`${API_BASE}/vault/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const d = await res.json()
        setSelectedUserVault(d.vault)
      }
    } catch (e) {
      console.error('Failed to fetch selected user vault:', e)
    } finally {
      setSelectedUserVaultLoading(false)
    }
  }

  const selectUserForEditing = async (targetUser) => {
    setSelectedUser(targetUser)
    setUserRoleSelect(targetUser.role)
    const newForm = { vault: 'inherit' }
    if (targetUser.permissionOverrides && targetUser.permissionOverrides.length > 0) {
      targetUser.permissionOverrides.forEach(o => {
        if (newForm[o.resource] !== undefined) {
          newForm[o.resource] = o.access
        }
      })
    }
    setUserOverridesForm(newForm)
    
    
    fetchSelectedUserVault(targetUser._id)

    setEditUserForm({
      firstName: targetUser.firstName || '',
      lastName: targetUser.lastName || '',
      email: targetUser.email || '',
      mobile: targetUser.mobile || '',
      department: targetUser.department || '',
      emailVerified: !!targetUser.emailVerified,
      mobileVerified: !!targetUser.mobileVerified
    })
    setSelectedUserLastSession(null)

    fetchAdminFields()
    setCustomFieldsLoading(true)
    setSelectedUserCustomFields(null)
    try {
      const res = await fetch(`${API_BASE}/users/${targetUser._id}/custom-fields`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSelectedUserCustomFields(data.values || {})
        setSelectedUserLastSession(data.lastSession || null)
        const initialCustomFields = {};
        Object.entries(data.values || {}).forEach(([k, v]) => {
          initialCustomFields[k] = v.value || '';
        });
        setEditUserForm(prev => ({
          ...prev,
          dynamicFields: initialCustomFields
        }))
      }
    } catch (e) {
      console.error('Failed to fetch selected user custom fields:', e)
    } finally {
      setCustomFieldsLoading(false)
    }
  }

  const saveUserProfile = async () => {
    
    
    try {
      const res = await fetch(`${API_BASE}/users/${selectedUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editUserForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')
      addToast(data.message || 'User profile updated successfully!', 'success')
      fetchUsers()
      setSelectedUser(prev => ({
        ...prev,
        firstName: editUserForm.firstName,
        lastName: editUserForm.lastName,
        email: editUserForm.email,
        mobile: editUserForm.mobile,
        department: editUserForm.department,
        emailVerified: editUserForm.emailVerified,
        mobileVerified: editUserForm.mobileVerified
      }))
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const saveUserRole = async () => {
    
    
    try {
      const res = await fetch(`${API_BASE}/users/${selectedUser._id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: userRoleSelect })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update user role')
      addToast(data.message || 'User role assigned successfully!', 'success')
      
      if (data.demotedRequester) {
        if (data.demotedRequester.role === 'user') {
          // Managers demoted to standard user must log out of the admin panel
          addToast('Manager authority transferred! You are now a standard user. Logging out...', 'warning')
          setTimeout(() => adminLogout(), 2000)
          return
        } else {
          // Admin demoted to manager
          addToast('Admin authority transferred successfully! You are now a manager.', 'warning')
          const updatedAdmin = { ...admin, role: data.demotedRequester.role }
          localStorage.setItem('masc_admin', JSON.stringify(updatedAdmin))
          setAdmin(updatedAdmin)
        }
      }
      
      addToast(data.message || 'User role updated successfully!', 'success')
      fetchUsers()
      setSelectedUser(prev => ({ ...prev, role: userRoleSelect }))
    } catch (err) {
      addToast(err.message, 'error')
      addToast(err.message, 'error')
    }
  }

  const saveUserOverrides = async () => {
    
    
    const permissionOverrides = []
    Object.entries(userOverridesForm).forEach(([resource, access]) => {
      if (access !== 'inherit') {
        permissionOverrides.push({ resource, access })
      }
    })
    try {
      const res = await fetch(`${API_BASE}/users/${selectedUser._id}/overrides`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ permissionOverrides })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update permission overrides')
      addToast('Permission overrides saved successfully!', 'success')
      fetchUsers()
      setSelectedUser(prev => ({ ...prev, permissionOverrides }))
    } catch (err) {
      addToast(err.message, 'error')
    }
  }



  const renderAccessDenied = (errorMsg) => {
    return (
      <div className="glass-panel" style={{
        padding: '60px 40px',
        textAlign: 'center',
        margin: '20px auto',
        maxWidth: '500px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        background: 'rgba(254, 242, 242, 0.03)',
        backdropFilter: 'blur(12px)',
        borderRadius: 'var(--radius-xl)'
      }}>
        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 8px 24px rgba(239, 68, 68, 0.15); }
            50% { transform: scale(1.05); box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3); }
            100% { transform: scale(1); box-shadow: 0 8px 24px rgba(239, 68, 68, 0.15); }
          }
        `}</style>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--danger)',
          fontSize: '32px',
          boxShadow: '0 8px 24px rgba(239, 68, 68, 0.15)',
          animation: 'pulse 2s infinite'
        }}>
          🔒
        </div>
        
        <div style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: '800', color: 'var(--danger)', letterSpacing: '2px', background: 'rgba(239, 68, 68, 0.08)', padding: '6px 14px', borderRadius: '9999px' }}>
          Security Policy Restriction
        </div>

        <h3 style={{ fontSize: '22px', fontWeight: '800', margin: '0' }}>Access Denied</h3>
        
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', margin: '0' }}>
          {errorMsg || 'You do not have the required permissions to view this resource.'}
        </p>

        <div style={{
          marginTop: '10px',
          padding: '16px',
          background: 'rgba(124, 58, 237, 0.03)',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--text-muted)',
          textAlign: 'left',
          width: '100%'
        }}>
          <strong>💡 Troubleshooting Guide:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>Verify your role assignment under Admin Console.</li>
            <li>Check for active individual user override denials.</li>
            <li>Consult the Audit Log panel for access denied event details.</li>
          </ul>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="status-dot online" style={{ width: '20px', height: '20px', marginBottom: '20px' }}></div>
        <p style={{ fontWeight: '600', fontFamily: 'var(--font-heading)' }}>Verifying system initialization...</p>
      </div>
    )
  }

  return (
    <MascThemeProvider organization={organization}>
        {user && <MascSecurityToastAlerts userSessions={userSessions} userSessionToken={userSessionToken} />}
        <div className="app-container container">
        {/* Decorative background blobs */}
        <div className="bg-blobs" aria-hidden="true">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div style={{ background: 'var(--danger)', color: 'white', padding: '8px 16px', fontSize: '14px', textAlign: 'center', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
            System Error: {error}
          </div>
        )}

        {setupRequired ? (
          /* 1. First Run Wizard Flow */
          <MascSetupWizard onComplete={runSetupWizard} />
        ) : (
          /* 2. Platform Core Views */
          <div>
            {setupCredentials && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 3000,
                animation: 'fadeIn 0.2s ease-out'
              }}>
                <div className="glass-panel" style={{
                  background: 'rgba(17, 12, 28, 0.98)',
                  border: '2px solid var(--primary-start)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '36px',
                  width: '100%',
                  maxWidth: '700px',
                  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
                  textAlign: 'left',
                  color: '#ffffff'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <span style={{ fontSize: '40px' }}>🚀</span>
                    <h3 style={{ fontSize: '24px', fontWeight: '800', margin: '12px 0 6px', color: 'white' }}>
                      Setup Complete! Your Entity Credentials Are Ready
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                      MASC has auto-provisioned your first operational application client. Copy these credentials to initialize the Developer SDK.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                    
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>Application (Entity) Name</span>
                      <strong style={{ fontSize: '14px', color: 'white' }}>{setupCredentials.applicationName}</strong>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>Application (Entity) ID</span>
                        <code style={{ fontSize: '12px', color: 'var(--primary-start)' }}>{setupCredentials.applicationId}</code>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>Tenant ID (Organization ID)</span>
                        <code style={{ fontSize: '12px', color: 'var(--primary-start)' }}>{setupCredentials.tenantId}</code>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>API Key ID</span>
                      <code style={{ fontSize: '12px', color: 'white' }}>{setupCredentials.apiKey}</code>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>API Secret (Client Secret Token)</span>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                        <code style={{ fontSize: '13px', color: '#F59E0B', wordBreak: 'break-all', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', flex: 1 }}>
                          {setupCredentials.apiSecret}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(setupCredentials.apiSecret);
                            addToast('Copied client secret!', 'success');
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '8px 12px', fontSize: '12px' }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                  </div>

                  <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)', color: '#FFB3B3', fontSize: '12px', marginBottom: '24px', textAlign: 'center', fontWeight: '500' }}>
                    ⚠️ WARNING: Copy the Client Secret Key now. For your security, it will NOT be shown again!
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={() => {
                        const jsonStr = JSON.stringify(setupCredentials, null, 2);
                        navigator.clipboard.writeText(jsonStr);
                        addToast('Copied credentials JSON!', 'success');
                      }}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '12px' }}
                    >
                      📋 Copy All as JSON
                    </button>
                    <button
                      onClick={() => setSetupCredentials(null)}
                      className="btn btn-primary"
                      style={{ flex: 1.2, padding: '12px' }}
                    >
                      ✨ Enter Dashboard
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* White Label Header */}
            <header>
              <div className="logo-container">
                <div className="logo-icon">{organization?.name ? organization.name[0].toUpperCase() : 'M'}</div>
                <span className="logo-text">{organization?.name || 'MASC Security'}</span>
              </div>
              
              <nav className="nav-links">
                {admin && (
                  <button onClick={adminLogout} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                    Sign Out
                  </button>
                )}
              </nav>
            </header>

            <main style={{ marginTop: '40px', paddingBottom: '80px' }}>
              
              {/* ADMIN PORTAL PANEL */}
              {portalMode === 'admin' && (
                !admin ? (
                  <MascAdminLogin onLogin={adminLogin} verifyAdminOtp={verifyAdminOtp} />
                ) : (
                  <div>
                    {/* Welcome Banner */}
                    <div className="glass-panel" style={{ padding: '40px', marginBottom: '32px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                          <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '8px' }}>MASC Security Administration</h1>
                          <p style={{ color: 'var(--text-muted)' }}>Signed in as <strong>{admin.name}</strong> ({admin.email}) | Role: <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{admin.role}</span></p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>
                            <span className="status-dot online" style={{ marginRight: '6px', width: '8px', height: '8px' }}></span>
                            Centralized Authorization Active
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Admin Dashboard Tab Navigation */}
                    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '32px', overflowX: 'auto' }}>
                      {(admin.role === 'admin' || (admin.role === 'manager' && organization?.managerPermissions?.canAccessBranding)) && (
                        <button
                          onClick={() => setAdminTab('branding')}
                          className={`btn ${adminTab === 'branding' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'branding' ? 'none' : '1px solid var(--border)' }}
                        >
                          🎨 Branding Config
                        </button>
                      )}
                      {admin.role === 'admin' && (
                        <button
                          onClick={() => setAdminTab('roles')}
                          className={`btn ${adminTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'roles' ? 'none' : '1px solid var(--border)' }}
                        >
                          🛡️ Roles & Permissions
                        </button>
                      )}
                      <button
                        onClick={() => setAdminTab('users')}
                        className={`btn ${adminTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'users' ? 'none' : '1px solid var(--border)' }}
                      >
                        👤 User Access & Overrides
                      </button>
                      <button
                        onClick={() => setAdminTab('logs')}
                        className={`btn ${adminTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'logs' ? 'none' : '1px solid var(--border)' }}
                      >
                        📝 Security Audit Logs
                      </button>
                      <button
                        onClick={() => setAdminTab('sessions')}
                        className={`btn ${adminTab === 'sessions' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'sessions' ? 'none' : '1px solid var(--border)' }}
                      >
                        🛡️ Live Sessions
                      </button>
                      {admin.role === 'admin' && (
                        <button
                          onClick={() => setAdminTab('fields')}
                          className={`btn ${adminTab === 'fields' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'fields' ? 'none' : '1px solid var(--border)' }}
                        >
                          ⚙️ Dynamic Fields
                        </button>
                      )}
                      {admin.role === 'admin' && (
                        <button
                          onClick={() => setAdminTab('ai-hub')}
                          className={`btn ${adminTab === 'ai-hub' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'ai-hub' ? 'none' : '1px solid var(--border)' }}
                        >
                          🛡️ AI Security Hub
                        </button>
                      )}
                      {(admin.role === 'admin' || (admin.role === 'manager' && organization?.managerPermissions?.canAccessVaultGovernance)) && (
                        <button
                          onClick={() => setAdminTab('vault-governance')}
                          className={`btn ${adminTab === 'vault-governance' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'vault-governance' ? 'none' : '1px solid var(--border)' }}
                        >
                          🔐 Vault Governance
                        </button>
                      )}
                      {admin.role === 'admin' && (
                        <button
                          onClick={() => setAdminTab('api-keys')}
                          className={`btn ${adminTab === 'api-keys' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'api-keys' ? 'none' : '1px solid var(--border)' }}
                        >
                          📱 API Keys
                        </button>
                      )}
                      {(admin.role === 'admin' || (admin.role === 'manager' && organization?.managerPermissions?.canAccessRouteRules)) && (
                        <button
                          onClick={() => setAdminTab('route-rules')}
                          className={`btn ${adminTab === 'route-rules' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'route-rules' ? 'none' : '1px solid var(--border)' }}
                        >
                          🛣️ Route Rules
                        </button>
                      )}
                      <button
                        onClick={() => setAdminTab('profile')}
                        className={`btn ${adminTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '8px 16px', fontSize: '13px', border: adminTab === 'profile' ? 'none' : '1px solid var(--border)' }}
                      >
                        👤 Admin Profile
                      </button>
                    </div>

                    {/* CONDITIONAL ADMIN VIEWS */}
                    
                    {/* 1. Branding Config Tab */}
                    {adminTab === 'branding' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Branding Setup</h3>
                          <button onClick={startEditing} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                            Edit Branding Color Palette
                          </button>
                        </div>

                        {isEditing && (
                          <div className="glass-panel" style={{ padding: '40px', textAlign: 'left', marginBottom: '32px' }}>
                            <h2 style={{ fontSize: '24px', marginBottom: '8px', fontWeight: '700' }}>Edit White-Label settings</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '14px' }}>
                              Adjust custom gradients and styling variables stored in the database.
                            </p>
                            


                            <form onSubmit={saveBrandingChanges}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '30px' }}>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Organization Name</label>
                                  <input
                                    type="text"
                                    name="name"
                                    value={brandEdit.name}
                                    onChange={handleEditChange}
                                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                                    required
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Accent Color</label>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                      type="color"
                                      name="accentColor"
                                      value={brandEdit.accentColor}
                                      onChange={handleEditChange}
                                      style={{ border: 'none', background: 'transparent', width: '36px', height: '36px', cursor: 'pointer' }}
                                    />
                                    <input
                                      type="text"
                                      name="accentColor"
                                      value={brandEdit.accentColor}
                                      onChange={handleEditChange}
                                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Primary Gradient Colors</label>
                                  <div style={{ display: 'flex', gap: '12px' }}>
                                    <input
                                      type="color"
                                      name="primaryGradientStart"
                                      value={brandEdit.primaryGradientStart}
                                      onChange={handleEditChange}
                                      style={{ border: 'none', background: 'transparent', width: '36px', height: '36px', cursor: 'pointer' }}
                                    />
                                    <input
                                      type="color"
                                      name="primaryGradientEnd"
                                      value={brandEdit.primaryGradientEnd}
                                      onChange={handleEditChange}
                                      style={{ border: 'none', background: 'transparent', width: '36px', height: '36px', cursor: 'pointer' }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Secondary Gradient Colors</label>
                                  <div style={{ display: 'flex', gap: '12px' }}>
                                    <input
                                      type="color"
                                      name="secondaryGradientStart"
                                      value={brandEdit.secondaryGradientStart}
                                      onChange={handleEditChange}
                                      style={{ border: 'none', background: 'transparent', width: '36px', height: '36px', cursor: 'pointer' }}
                                    />
                                    <input
                                      type="color"
                                      name="secondaryGradientEnd"
                                      value={brandEdit.secondaryGradientEnd}
                                      onChange={handleEditChange}
                                      style={{ border: 'none', background: 'transparent', width: '36px', height: '36px', cursor: 'pointer' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                      type="checkbox"
                                      name="vaultMode"
                                      checked={brandEdit.vaultMode}
                                      onChange={handleEditChange}
                                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary-start)' }}
                                    />
                                    <div>
                                      <span style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Enable Vault System Mode</span>
                                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Dynamically creates a secure user resource database container for every member.
                                      </span>
                                    </div>
                                  </label>
                                </div>
                                <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
                                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600' }}>Max Verification OTP Attempts</label>
                                  <input
                                    type="number"
                                    name="maxVerificationAttempts"
                                    value={brandEdit.maxVerificationAttempts}
                                    onChange={handleEditChange}
                                    min="1"
                                    max="10"
                                    style={{ width: '120px', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                                    required
                                  />
                                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Lock out or invalidate OTP codes after this many incorrect inputs. Configure between 1 and 10 attempts.
                                  </span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" className="btn btn-primary">Save Branding</button>
                                <button type="button" onClick={() => setIsEditing(false)} className="btn btn-secondary">Cancel</button>
                              </div>
                            </form>
                          </div>
                        )}

                        <div className="features-grid" style={{ marginBottom: '40px' }}>
                          <div className="feature-card glass-panel" style={{ padding: '24px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Active Users</span>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px' }}>{dashboardStats.activeUsersCount}</div>
                            <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: '600' }}>Registered active members</span>
                          </div>
                          <div className="feature-card glass-panel" style={{ padding: '24px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Active Sessions</span>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px' }}>{dashboardStats.activeSessionsCount}</div>
                            <span style={{ fontSize: '11px', color: 'var(--success)' }}>Current active device sessions</span>
                          </div>
                          <div className="feature-card glass-panel" style={{ padding: '24px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Risk Alert Events</span>
                            <div style={{ fontSize: '32px', fontWeight: '800', marginTop: '4px', color: dashboardStats.riskEventsCount > 0 ? 'var(--warning)' : 'var(--text-dark)' }}>{dashboardStats.riskEventsCount}</div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unresolved security anomalies</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Roles & Permissions Tab */}
                    {adminTab === 'roles' && (
                      <>
                        <div style={{ textAlign: 'left' }}>
                          {/* Left Column: Roles list */}
                          <div className="glass-panel" style={{ padding: '24px' }}>
                            <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                              System Roles
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              {roles.filter(r => r.name !== 'admin').map(r => (
                                <div key={r._id} style={{ padding: '16px', background: 'rgba(124, 58, 237, 0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <strong style={{ fontSize: '16px', textTransform: 'uppercase' }}>{r.name}</strong>
                                      {r.isSystem && (
                                        <span style={{ padding: '2px 8px', background: 'rgba(124, 58, 237, 0.08)', color: 'var(--primary-start)', fontSize: '10px', borderRadius: '4px', fontWeight: '700', textTransform: 'uppercase' }}>
                                          System
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>{r.description || 'No description provided.'}</p>
                                  
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {r.name === 'manager' && (() => {
                                      const allowed = organization?.managerPermissions?.canAccessVaultGovernance;
                                      return (
                                        <span style={{
                                          fontSize: '11px',
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          fontWeight: '600',
                                          background: allowed ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                          color: allowed ? 'var(--success)' : 'var(--danger)',
                                          border: `1px solid ${allowed ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`
                                        }}>
                                          vault governance: {allowed ? 'allowed' : 'denied'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Manager Role Permissions Configuration */}
                        <div className="glass-panel" style={{ padding: '28px', marginTop: '24px', textAlign: 'left' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>🔧 Manager Role Permissions</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                            Control what actions managers are allowed to perform on the admin panel. These settings apply to all users with the manager role.
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {[
                              { key: 'canEditUsers', label: 'Edit User Details', desc: 'Allow managers to modify user profile information (name, email, phone, custom fields)' },
                              { key: 'canSuspendUsers', label: 'Suspend / Reactivate Users', desc: 'Allow managers to suspend or reactivate user-level accounts' },
                              { key: 'canViewUserLogs', label: 'View User Audit Logs', desc: 'Allow managers to view individual user activity and audit logs' },
                              { key: 'canAccessVaultGovernance', label: 'Vault Governance Access', desc: 'Allow managers to access vault clusters, collections, and data governance controls' },
                              { key: 'canAccessRouteRules', label: 'Route Rules Access', desc: 'Allow managers to define, modify, and delete route-based access policy rules' },
                              { key: 'canAccessBranding', label: 'Branding Configuration Access', desc: 'Allow managers to configure application branding, color theme, and default security policies' }
                            ].map(perm => (
                              <div key={perm.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(124,58,237,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <div>
                                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{perm.label}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{perm.desc}</div>
                                </div>
                                <button
                                  onClick={async () => {
                                    const current = organization?.managerPermissions || {};
                                    const updated = { ...current, [perm.key]: !current[perm.key] };
                                    try {
                                      await updateBranding({ managerPermissions: updated });
                                      addToast(`Manager permission "${perm.label}" ${!current[perm.key] ? 'enabled' : 'disabled'}.`, 'success');
                                    } catch (err) {
                                      addToast(err.message || 'Failed to update manager permissions', 'error');
                                    }
                                  }}
                                  style={{
                                    width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                    background: (organization?.managerPermissions?.[perm.key]) ? 'var(--success)' : 'rgba(100,100,100,0.25)',
                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                                  }}
                                >
                                  <span style={{
                                    position: 'absolute', top: '3px',
                                    left: (organization?.managerPermissions?.[perm.key]) ? '27px' : '3px',
                                    width: '22px', height: '22px', borderRadius: '50%', background: 'white',
                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                  }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* 3. User Access & Overrides Tab */}
                    {adminTab === 'users' && (
                      <div className="masc-grid-2col-split" style={{ textAlign: 'left' }}>
                        {/* Left Column: Registered Users list */}
                        <div className="glass-panel" style={{ padding: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <h4 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>
                              Registered Members
                            </h4>
                          </div>
                          <div style={{ marginBottom: '16px' }}>
                            <input
                              type="text"
                              placeholder="🔍 Search members by name, email, phone, role, dept, or ID..."
                              value={userSearchQuery}
                              onChange={(e) => setUserSearchQuery(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-dark)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '13px',
                                outline: 'none',
                                transition: 'border-color 0.15s ease'
                              }}
                            />
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                                  <th style={{ padding: '10px', textAlign: 'left' }}>User</th>
                                  <th style={{ padding: '10px', textAlign: 'left' }}>Role</th>
                                  <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                                  <th style={{ padding: '10px', textAlign: 'center' }}>Risk Score</th>
                                  <th style={{ padding: '10px', textAlign: 'center' }}>Overrides</th>
                                  <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usersList
                                  .filter(u => {
                                    if (!userSearchQuery) return true;
                                    const q = userSearchQuery.toLowerCase();
                                    return (
                                      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                                      (u.email || '').toLowerCase().includes(q) ||
                                      (u.mobile || '').toLowerCase().includes(q) ||
                                      (u.role || '').toLowerCase().includes(q) ||
                                      (u.department || '').toLowerCase().includes(q) ||
                                      (u._id || '').toLowerCase().includes(q)
                                    );
                                  })
                                  .map(u => {
                                    const score = u.currentRiskScore !== undefined ? u.currentRiskScore : 10;
                                  const severity = u.currentRiskSeverity || 'safe';
                                  
                                  return (
                                    <tr key={u._id} style={{ borderBottom: '1px solid var(--border)', background: selectedUser?._id === u._id ? 'rgba(124, 58, 237, 0.03)' : 'transparent' }}>
                                      <td style={{ padding: '12px 10px' }}>
                                        <div style={{ fontWeight: '600' }}>{u.firstName} {u.lastName}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
                                      </td>
                                      <td style={{ padding: '12px 10px' }}>
                                        <span style={{
                                          textTransform: 'uppercase',
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          padding: '2px 8px',
                                          background: 'rgba(124, 58, 237, 0.08)',
                                          color: 'var(--primary-start)',
                                          borderRadius: '4px'
                                        }}>
                                          {u.role}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                        <span style={{
                                          fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px',
                                          background: u.status === 'active' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                                          color: u.status === 'active' ? 'var(--success)' : 'var(--danger)',
                                          border: u.status === 'active' ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)'
                                        }}>
                                          {u.status === 'active' ? '● Active' : '○ Suspended'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                        <span style={{
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          padding: '3px 8px',
                                          borderRadius: '4px',
                                          background: score >= 75 ? 'rgba(239, 68, 68, 0.08)' : score >= 35 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                          color: score >= 75 ? 'var(--danger)' : score >= 35 ? 'var(--warning)' : 'var(--success)',
                                          border: score >= 75 ? '1px solid rgba(239, 68, 68, 0.15)' : score >= 35 ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(16, 185, 129, 0.15)',
                                          display: 'inline-block'
                                        }}>
                                          {score}% ({severity})
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '700' }}>
                                        {u.permissionOverrides ? u.permissionOverrides.length : 0}
                                      </td>
                                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                        {(() => {
                                          const isManager = admin.role === 'manager';
                                          const isTargetHigher = u.role === 'admin' || u.role === 'manager';
                                          const mp = organization?.managerPermissions || {};
                                          const showLogs = !isManager || (!isTargetHigher && mp.canViewUserLogs);
                                          const showSuspend = !isManager || (!isTargetHigher && mp.canSuspendUsers);
                                          const showManage = !isManager || (!isTargetHigher && mp.canEditUsers);
                                          return (
                                            <>
                                              {showLogs && (
                                                <button onClick={() => viewUserLogs(u)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}>
                                                  📜 Logs
                                                </button>
                                              )}
                                              {showSuspend && (
                                                <button
                                                  onClick={() => handleUserStatusToggle(u)}
                                                  className="btn"
                                                  style={{
                                                    padding: '4px 8px', fontSize: '11px', marginRight: '4px',
                                                    background: u.status === 'active' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                                                    color: u.status === 'active' ? 'var(--danger)' : 'var(--success)',
                                                    border: u.status === 'active' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)',
                                                    borderRadius: 'var(--radius-sm)'
                                                  }}
                                                >
                                                  {u.status === 'active' ? '🔒 Suspend' : '✅ Reactivate'}
                                                </button>
                                              )}
                                              {showManage && (
                                                <button onClick={() => selectUserForEditing(u)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>
                                                  ⚙️ Manage
                                                </button>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Right Column: User assignment and overrides details */}
                        <div className="glass-panel" style={{ padding: '24px' }}>
                          {selectedUser ? (
                            <div>
                              <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>
                                Manage Access: {selectedUser.firstName} {selectedUser.lastName}
                              </h4>

                              {/* Member Profile Details Panel (Edit Mode) */}
                              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>👤 Member Profile Details & Status</span>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', marginBottom: '12px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>FIRST NAME</label>
                                      <input
                                        type="text"
                                        value={editUserForm.firstName || ''}
                                        onChange={(e) => setEditUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px' }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>LAST NAME</label>
                                      <input
                                        type="text"
                                        value={editUserForm.lastName || ''}
                                        onChange={(e) => setEditUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                                        style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px' }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>EMAIL ADDRESS</label>
                                    <input
                                      type="email"
                                      value={editUserForm.email || ''}
                                      onChange={(e) => setEditUserForm(prev => ({ ...prev, email: e.target.value }))}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px' }}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>MOBILE NUMBER</label>
                                    <input
                                      type="text"
                                      value={editUserForm.mobile || ''}
                                      onChange={(e) => setEditUserForm(prev => ({ ...prev, mobile: e.target.value }))}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px' }}
                                    />
                                  </div>



                                  {/* Verification parameter toggles */}
                                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!editUserForm.emailVerified}
                                        onChange={(e) => setEditUserForm(prev => ({ ...prev, emailVerified: e.target.checked }))}
                                      />
                                      <span>Verify Email</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!editUserForm.mobileVerified}
                                        onChange={(e) => setEditUserForm(prev => ({ ...prev, mobileVerified: e.target.checked }))}
                                      />
                                      <span>Verify Mobile</span>
                                    </label>
                                  </div>

                                  <div style={{ marginTop: '8px' }}>
                                    <button
                                      onClick={saveUserProfile}
                                      className="btn btn-primary"
                                      style={{ width: '100%', padding: '8px', fontSize: '12px' }}
                                    >
                                      💾 Save Profile Changes
                                    </button>
                                  </div>

                                  <div style={{ borderTop: '1px dashed var(--border)', marginTop: '8px', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>METADATA</span>
                                    <div><span style={{ color: 'var(--text-muted)' }}>Created At:</span> <span style={{ color: 'var(--text-dark)' }}>{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'N/A'}</span></div>
                                    <div><span style={{ color: 'var(--text-muted)' }}>User ID:</span> <code style={{ fontSize: '11px' }}>{selectedUser._id}</code></div>
                                  </div>

                                  {/* Last Session Info */}
                                  <div style={{ borderTop: '1px dashed var(--border)', marginTop: '8px', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>LAST ACTIVE SESSION</span>
                                    {customFieldsLoading ? (
                                      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading session info...</div>
                                    ) : !selectedUserLastSession ? (
                                      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No active or past sessions recorded.</div>
                                    ) : (
                                      <div style={{ fontSize: '11px', color: 'var(--text-dark)' }}>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> <span style={{ textTransform: 'uppercase', fontWeight: '700', color: selectedUserLastSession.status === 'active' ? 'var(--success)' : 'var(--danger)' }}>{selectedUserLastSession.status}</span></div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>IP:</span> <code>{selectedUserLastSession.ipAddress || 'Unknown'}</code></div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Device:</span> <span>{selectedUserLastSession.browser} ({selectedUserLastSession.os})</span></div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Location:</span> <span>{selectedUserLastSession.location || 'Unknown'}</span></div>
                                        <div><span style={{ color: 'var(--text-muted)' }}>Last Activity:</span> <span>{new Date(selectedUserLastSession.lastActivity).toLocaleString()}</span></div>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Custom Dynamic Fields */}
                                  <div style={{ borderTop: '1px dashed var(--border)', marginTop: '8px', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>🏷️ Custom Dynamic Fields</span>
                                    {customFieldsLoading ? (
                                      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>Loading custom fields...</div>
                                    ) : (
                                      <div style={{ marginTop: '8px' }}>
                                        <MascDynamicForm
                                          fields={adminFields.filter(field => field.status === 'active' && field.placement !== 'branding')}
                                          values={editUserForm.dynamicFields || {}}
                                          onChange={(fieldName, newValue) => setEditUserForm(prev => ({
                                            ...prev,
                                            dynamicFields: {
                                              ...(prev.dynamicFields || {}),
                                              [fieldName]: newValue
                                            }
                                          }))}
                                          disabled={customFieldsLoading}
                                        />
                                      </div>
                                    )}                                  </div>
                                </div>
                              </div>



                              {/* Section 1: Role Change */}
                              <div style={{ marginBottom: '28px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700' }}>Role Assignment</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <select
                                    value={userRoleSelect}
                                    onChange={(e) => setUserRoleSelect(e.target.value)}
                                    style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', outline: 'none', background: 'white', color: 'black' }}
                                  >
                                    {roles.filter(r => r.name !== 'admin').map(r => (
                                      <option key={r._id} value={r.name}>{r.name.toUpperCase()}</option>
                                    ))}
                                  </select>
                                  <button onClick={saveUserRole} className="btn btn-primary" style={{ padding: '10px 16px', fontSize: '13px' }}>
                                    Assign
                                  </button>
                                </div>
                              </div>


                            </div>
                          ) : (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👤</div>
                              <p style={{ fontWeight: '600', fontSize: '14px', margin: 0 }}>No Member Selected</p>
                              <p style={{ fontSize: '12px', margin: '4px 0 0 0' }}>Select an organization member from the left panel to modify roles or setup policy overrides.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Security Audit Logs Tab */}
                    {adminTab === 'logs' && (
                      <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '16px' }}>
                          <div>
                            <h4 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Security Incident & Policy Audits</h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>Tracks administrative role/override updates and member access denials.</p>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            {admin.role === 'admin' && (
                              <button onClick={() => setFlushModalOpen(true)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px', background: 'var(--danger)', border: 'none' }}>
                                🗑️ Flush Logs
                              </button>
                            )}
                            <button onClick={fetchAuditLogs} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                              🔄 Refresh Logs
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                          {auditLogs.length === 0 ? (
                            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>No audit events logged.</div>
                          ) : (
                            auditLogs.map(log => {
                              let actionColor = 'var(--text-muted)';
                              let actionBg = 'rgba(107, 114, 128, 0.08)';
                              if (log.action === 'ACCESS_DENIED' || log.action === 'SESSION_HIJACK_DETECTED') {
                                actionColor = 'var(--danger)';
                                actionBg = 'rgba(239, 68, 68, 0.08)';
                              } else if (log.action === 'USER_LOGIN') {
                                actionColor = 'var(--success)';
                                actionBg = 'rgba(34, 197, 94, 0.08)';
                              } else if (log.action === 'USER_LOGOUT') {
                                actionColor = '#F59E0B';
                                actionBg = 'rgba(245, 158, 11, 0.08)';
                              } else if (log.action === 'USER_PROFILE_UPDATE' || log.action === 'USER_PASSWORD_CHANGE') {
                                actionColor = 'var(--primary-start)';
                                actionBg = 'rgba(124, 58, 237, 0.08)';
                              } else if (log.action === 'ROLE_CREATE' || log.action === 'ROLE_UPDATE') {
                                actionColor = 'var(--success)';
                                actionBg = 'rgba(34, 197, 94, 0.08)';
                              } else if (log.action === 'USER_OVERRIDE') {
                                actionColor = 'var(--primary-start)';
                                actionBg = 'rgba(124, 58, 237, 0.08)';
                              } else if (log.action === 'USER_ROLE_UPDATE') {
                                actionColor = '#06B6D4';
                                actionBg = 'rgba(6, 182, 212, 0.08)';
                              }

                              return (
                                <div key={log._id} style={{ display: 'flex', gap: '16px', padding: '14px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                                  <div style={{ minWidth: '150px' }}>
                                    <div style={{ fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)' }}>
                                      {new Date(log.createdAt).toLocaleString()}
                                    </div>
                                    <span style={{
                                      display: 'inline-block',
                                      marginTop: '6px',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontWeight: '700',
                                      fontSize: '9px',
                                      color: actionColor,
                                      background: actionBg,
                                      border: `1px solid ${actionBg}`
                                    }}>
                                      {log.action}
                                    </span>
                                  </div>
                                  
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '600' }}>
                                      {log.userType === 'admin' ? `Admin: ${log.userName}` : `User: ${log.userName}`}
                                      <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '6px' }}>({log.userEmail})</span>
                                    </div>
                                    <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                      {log.action === 'ACCESS_DENIED' && (
                                        <span>Blocked access to resource <strong>{log.details.resource || 'portal'}</strong> via <strong>{log.details.method || 'GET'}</strong> ({log.details.reason})</span>
                                      )}
                                      {log.action === 'USER_LOGIN' && (
                                        <span>User logged in from device: <strong>{getCleanDevice(log)}</strong>. Telemetry: {log.details.deviceSecure ? '🛡️ Secure Device' : '❌ Unsecure Device'}, {log.details.vpnActive ? '🔗 VPN Active' : '📶 Direct Connection'}, {log.details.isPublicNetwork ? '☕ Public WiFi' : '🏠 Private Network'}. {log.details.note || ''}</span>
                                      )}
                                      {log.action === 'USER_LOGOUT' && (
                                        <span>User logged out / session terminated.</span>
                                      )}
                                      {log.action === 'USER_PROFILE_UPDATE' && (
                                        <span>Updated profile name details to: <strong>{log.details.firstName} {log.details.lastName}</strong></span>
                                      )}
                                      {log.action === 'USER_PASSWORD_CHANGE' && (
                                        <span>Changed account password successfully.</span>
                                      )}
                                      {log.action === 'SESSION_HIJACK_DETECTED' && (
                                        <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>
                                          🚨 SESSION HIJACK DETECTED: expected IP <strong>{log.details.expectedIp}</strong> but request came from <strong>{log.details.actualIp}</strong> (Device: <strong>{log.details.actualDevice}</strong>). Session automatically revoked.
                                        </span>
                                      )}
                                      {log.action === 'ROLE_CREATE' && (
                                        <span>Created new custom role <strong>{log.details.name}</strong></span>
                                      )}
                                      {log.action === 'ROLE_UPDATE' && (
                                        <span>Updated role permissions for <strong>{log.details.name}</strong></span>
                                      )}
                                      {log.action === 'ROLE_DELETE' && (
                                        <span>Deleted custom role <strong>{log.details.name}</strong></span>
                                      )}
                                      {log.action === 'USER_ROLE_UPDATE' && (
                                        <span>Assigned user <strong>{log.details.targetUserEmail}</strong> from role <strong>{log.details.oldRole}</strong> to <strong>{log.details.newRole}</strong></span>
                                      )}
                                      {log.action === 'USER_OVERRIDE' && (
                                        <span>Configured specific access overrides for user <strong>{log.details.targetUserEmail}</strong> ({log.details.overrides.length} active policy overrides)</span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <div>IP: {log.ipAddress || '127.0.0.1'}</div>
                                    <div style={{ fontSize: '10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.userAgent}>
                                      {getCleanDevice(log)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* 5. Admin Sessions Tab - Phase 4 */}
                    {adminTab === 'sessions' && (
                      <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                          <div>
                            <h4 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Live Session Control Center</h4>
                            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>View and force-terminate active user sessions across all devices.</p>
                          </div>
                          <button onClick={fetchAdminSessions} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                            🔄 Refresh Sessions
                          </button>
                        </div>

                        {adminSessionsError && (
                          <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', marginBottom: '16px', fontSize: '14px' }}>
                            {adminSessionsError}
                          </div>
                        )}

                        {adminSessionsLoading && (
                          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading sessions...</div>
                        )}

                        {!adminSessionsLoading && adminSessions.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            📭 No active user sessions found.
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                          {!adminSessionsLoading && adminSessions.map(session => (
                            <div key={session._id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '14px 20px', background: 'rgba(255,255,255,0.02)',
                              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', gap: '16px'
                            }}>
                              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flex: 1 }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                                  {session.deviceType === 'mobile' ? '📱' : '🖥️'}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    {session.userId?.firstName} {session.userId?.lastName}
                                    <span style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '12px' }}>({session.userId?.email})</span>
                                    <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(124,58,237,0.1)', color: 'var(--primary-start)', borderRadius: '4px', textTransform: 'uppercase' }}>{session.userId?.role}</span>
                                    <span style={{
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      background: (session.riskScore || 10) >= 75 ? 'rgba(239, 68, 68, 0.08)' : (session.riskScore || 10) >= 35 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                                      color: (session.riskScore || 10) >= 75 ? 'var(--danger)' : (session.riskScore || 10) >= 35 ? 'var(--warning)' : 'var(--success)',
                                      border: (session.riskScore || 10) >= 75 ? '1px solid rgba(239, 68, 68, 0.15)' : (session.riskScore || 10) >= 35 ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(16, 185, 129, 0.15)'
                                    }}>
                                      ⚠️ Risk: {session.riskScore || 10}% ({(session.riskScore || 10) >= 75 ? 'critical' : (session.riskScore || 10) >= 35 ? 'suspicious' : 'safe'})
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                                    <span>{session.browser} / {session.os}</span>
                                    <span>🌐 {session.ipAddress === '::1' || session.ipAddress === '127.0.0.1' || session.ipAddress?.includes('127.0.0.1') ? '127.0.0.1 (Localhost)' : session.ipAddress}</span>
                                    <span>⏱ Last Check-In: {new Date(session.lastActivity).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                <button
                                  onClick={() => viewUserLogs(session.userId)}
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  📜 View Logs
                                </button>
                                <button
                                  onClick={() => setSelectedSessionForAiReport(session)}
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  🧠 AI Risk Report
                                </button>
                                <button
                                  onClick={() => {
                                    triggerConfirm(
                                      `Are you sure you want to force logout the session for ${session.userId?.firstName} ${session.userId?.lastName}?`,
                                      async () => {
                                        try {
                                          const res = await fetch(`${API_BASE}/sessions/admin/${session._id}`, {
                                            method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
                                          })
                                          if (res.ok) {
                                            addToast('Session force-terminated successfully.', 'success')
                                            fetchAdminSessions()
                                          } else {
                                            const d = await res.json()
                                            addToast(d.error || 'Failed to terminate session', 'error')
                                            setAdminSessionsError(d.error || 'Failed')
                                          }
                                        } catch (err) {
                                          addToast('Error: ' + err.message, 'error')
                                          setAdminSessionsError('Error: ' + err.message)
                                        }
                                      },
                                      { title: 'Force Terminate Session', confirmText: 'Force Logout', isDanger: true }
                                    )
                                  }}
                                  style={{ padding: '6px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                                >
                                  Force Logout
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Admin Profile & Security Configuration Tab */}
                    {adminTab === 'profile' && (
                      <div className="masc-grid-2col" style={{ textAlign: 'left' }}>
                        {/* Left Side: Admin Authority details */}
                        <div className="glass-panel" style={{ padding: '32px' }}>
                          <h4 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-dark)' }}>
                            👤 Security Authority Profile
                          </h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                            Verify your administrator credentials and permission scopes below.
                          </p>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Full Name</span>
                              <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '2px', color: 'var(--text-dark)' }}>{admin.name}</div>
                            </div>
                            <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Secure Email</span>
                              <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '2px', color: 'var(--text-dark)' }}>{admin.email}</div>
                            </div>
                            <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Assigned Security Role</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: admin.role === 'admin' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                  color: admin.role === 'admin' ? 'var(--danger)' : 'var(--warning)',
                                  border: admin.role === 'admin' ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid rgba(245, 158, 11, 0.15)',
                                  textTransform: 'uppercase'
                                }}>
                                  {admin.role}
                                </span>
                              </div>
                            </div>
                            <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Permission Scopes</span>
                              <ul style={{ paddingLeft: '20px', margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                {admin.role === 'admin' ? (
                                  <>
                                    <li>Full central database access</li>
                                    <li>Manage user identity parameters and placement values</li>
                                    <li>Create, modify and delete custom access roles</li>
                                    <li>Override dynamic access permission policies</li>
                                    <li>Configure company-wide whitelabel theme and gradients</li>
                                    <li>AI security threat threshold configuration</li>
                                  </>
                                ) : (
                                  <>
                                    <li>View security audit logs for all members</li>
                                    <li>Inspect active live device session metrics</li>
                                    <li>Trigger manual force logouts for suspicious sessions</li>
                                    <li>View and filter dynamic fields configurations</li>
                                  </>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Password Change Form */}
                        <div className="glass-panel" style={{ padding: '32px' }}>
                          <h4 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-dark)' }}>
                            🔒 Update Authority Password
                          </h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                            Ensure your account remains safe by rotating passwords regularly.
                          </p>



                          <form onSubmit={handleAdminPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Current Password</label>
                              <input
                                type="password"
                                value={adminCurrentPassword}
                                onChange={(e) => setAdminCurrentPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', outline: 'none', background: 'rgba(0,0,0,0.02)', color: 'var(--text-dark)' }}
                                required
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>New Password</label>
                              <input
                                type="password"
                                value={adminNewPassword}
                                onChange={(e) => setAdminNewPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', outline: 'none', background: 'rgba(0,0,0,0.02)', color: 'var(--text-dark)' }}
                                required
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Confirm New Password</label>
                              <input
                                type="password"
                                value={adminConfirmPassword}
                                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', outline: 'none', background: 'rgba(0,0,0,0.02)', color: 'var(--text-dark)' }}
                                required
                              />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ padding: '12px', width: '100%', marginTop: '8px' }}>
                              🔄 Rotate Password
                            </button>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* 6. Admin Dynamic Fields Tab - Phase 6 */}
                    {adminTab === 'fields' && (
                      <div className="masc-grid-2col-split" style={{ alignItems: 'start' }}>
                        
                        {/* Left Side: Field Definitions List & Import/Export */}
                        <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                            <div>
                              <h4 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Dynamic Field Engine</h4>
                              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>Configure custom user fields without changing application code.</p>
                            </div>
                            <button
                              onClick={() => {
                                setEditingFieldId(null);
                                setFieldFormData({
                                  name: '',
                                  label: '',
                                  type: 'text',
                                  required: false,
                                  readOnly: false,
                                  hidden: false,
                                  placeholder: '',
                                  description: '',
                                  defaultValue: '',
                                  options: '',
                                  validationMinLength: '',
                                  validationMaxLength: '',
                                  validationPattern: '',
                                  validationMin: '',
                                  validationMax: '',
                                  securityStoreType: 'normal',
                                  securityMaskValue: false,
                                  securityShowHideToggle: false,
                                  placement: 'profile',
                                  status: 'active',
                                  order: adminFields.length
                                });
                                setShowFieldForm(true);
                              }}
                              className="btn btn-primary"
                              style={{ padding: '8px 14px', fontSize: '13px' }}
                            >
                              ➕ Add Field
                            </button>
                          </div>



                          {/* Quick Config Actions */}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                            <button onClick={handleExportFields} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', flex: 1 }}>
                              📥 Export Config
                            </button>
                            <button onClick={() => setShowImportArea(!showImportArea)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', flex: 1 }}>
                              📤 Import Config
                            </button>
                          </div>

                          {showImportArea && (
                            <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px' }}>Paste Field Configurations JSON</label>
                              <textarea
                                value={importJson}
                                onChange={(e) => setImportJson(e.target.value)}
                                placeholder="[ { 'name': 'field_name', ... } ]"
                                style={{ width: '100%', minHeight: '120px', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none', color: '#fff', fontSize: '12px', fontFamily: 'monospace', marginBottom: '12px' }}
                              />
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowImportArea(false)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>Cancel</button>
                                <button onClick={handleImportFields} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>Import JSON</button>
                              </div>
                            </div>
                          )}

                          {adminFieldsLoading && (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading configured fields...</div>
                          )}

                          {!adminFieldsLoading && adminFields.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                              📭 No dynamic fields created yet. Click "Add Field" to define your first field.
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {!adminFieldsLoading && adminFields.map((field, idx) => (
                              <div key={field._id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', gap: '12px'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: '700', fontSize: '14px' }}>{field.label}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>({field.name})</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                    <span style={{ fontSize: '10px', background: 'rgba(124,58,237,0.1)', color: 'var(--primary-start)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                      {field.type}
                                    </span>
                                    <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px' }}>
                                      📍 {field.placement}
                                    </span>
                                    {field.required && (
                                      <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px' }}>
                                        Required
                                      </span>
                                    )}
                                    {field.security?.storeType !== 'normal' && (
                                      <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                        🔒 {field.security.storeType}
                                      </span>
                                    )}
                                    {field.status === 'disabled' && (
                                      <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '2px 6px', borderRadius: '4px' }}>
                                        Disabled
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Order & Actions list */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {/* Ordering buttons */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => handleMoveField(idx, -1)}
                                      style={{ padding: '2px 6px', fontSize: '9px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                                    >
                                      ▲
                                    </button>
                                    <button
                                      disabled={idx === adminFields.length - 1}
                                      onClick={() => handleMoveField(idx, 1)}
                                      style={{ padding: '2px 6px', fontSize: '9px', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', opacity: idx === adminFields.length - 1 ? 0.3 : 1 }}
                                    >
                                      ▼
                                    </button>
                                  </div>

                                  {/* Actions */}
                                  <button
                                    onClick={() => handleCloneField(field._id)}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '4px', padding: '6px', cursor: 'pointer' }}
                                    title="Clone Field"
                                  >
                                    👥
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFieldId(field._id);
                                      setFieldFormData({
                                        name: field.name,
                                        label: field.label,
                                        type: field.type,
                                        required: !!field.required,
                                        readOnly: !!field.readOnly,
                                        hidden: !!field.hidden,
                                        placeholder: field.placeholder || '',
                                        description: field.description || '',
                                        defaultValue: field.defaultValue || '',
                                        options: field.options ? field.options.join('\n') : '',
                                        validationMinLength: field.validation?.minLength || '',
                                        validationMaxLength: field.validation?.maxLength || '',
                                        validationPattern: field.validation?.pattern || '',
                                        validationMin: field.validation?.min || '',
                                        validationMax: field.validation?.max || '',
                                        securityStoreType: field.security?.storeType || 'normal',
                                        securityMaskValue: !!field.security?.maskValue,
                                        securityShowHideToggle: !!field.security?.showHideToggle,
                                        placement: field.placement || 'profile',
                                        status: field.status || 'active',
                                        order: field.order || 0
                                      });
                                      setShowFieldForm(true);
                                    }}
                                    style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '4px', padding: '6px', cursor: 'pointer' }}
                                    title="Edit Field"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteField(field._id)}
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', padding: '6px', cursor: 'pointer' }}
                                    title="Delete Field"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Right Side: Form Creator OR Live Form Preview */}
                        <div>
                          {showFieldForm ? (
                            <form onSubmit={handleSaveField} className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                              <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                                {editingFieldId ? 'Modify Dynamic Field' : 'Create Custom Parameter'}
                              </h4>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Field Identifier Name (Unique)</label>
                                    <input
                                      type="text"
                                      disabled={!!editingFieldId}
                                      value={fieldFormData.name}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                                      placeholder="e.g. employee_id"
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Field Label Title</label>
                                    <input
                                      type="text"
                                      value={fieldFormData.label}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, label: e.target.value }))}
                                      placeholder="e.g. Employee ID Card"
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                      required
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Field Type</label>
                                    <select
                                      value={fieldFormData.type}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, type: e.target.value }))}
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                    >
                                      <option value="text">Single Line Text</option>
                                      <option value="textarea">Multi Line Text</option>
                                      <option value="email">Email</option>
                                      <option value="mobile">Mobile Number</option>
                                      <option value="number">Number</option>
                                      <option value="password">Password</option>
                                      <option value="secure_password">Secure Password</option>
                                      <option value="encrypted_text">Encrypted Text</option>
                                      <option value="date">Date</option>
                                      <option value="datetime">Date & Time</option>
                                      <option value="dropdown">Dropdown</option>
                                      <option value="multiselect">Multi Select</option>
                                      <option value="checkbox">Checkbox</option>
                                      <option value="radio">Radio Button</option>
                                      <option value="url">URL</option>
                                      <option value="file">File Upload</option>
                                      <option value="image">Image Upload</option>
                                      <option value="hidden">Hidden Field</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Form Placement</label>
                                    <select
                                      value={fieldFormData.placement}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, placement: e.target.value }))}
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                    >
                                      <option value="registration">Registration Form</option>
                                      <option value="first_login">First Login Walkthrough</option>
                                      <option value="profile">Personal Profile Details</option>
                                      <option value="vault">Credential Vault Section</option>
                                      <option value="custom">Custom Application Workflow</option>
                                    </select>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Placeholder Hint</label>
                                    <input
                                      type="text"
                                      value={fieldFormData.placeholder}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, placeholder: e.target.value }))}
                                      placeholder="e.g. Enter details..."
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Default Value</label>
                                    <input
                                      type="text"
                                      value={fieldFormData.defaultValue}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, defaultValue: e.target.value }))}
                                      placeholder="Optional value seed"
                                      style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Field Description Tip</label>
                                  <input
                                    type="text"
                                    value={fieldFormData.description}
                                    onChange={(e) => setFieldFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Explain parameter requirements to the user"
                                    style={{ width: '100%', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                  />
                                </div>

                                {/* Options list for selectors */}
                                {(fieldFormData.type === 'dropdown' || fieldFormData.type === 'multiselect' || fieldFormData.type === 'radio') && (
                                  <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '4px' }}>Configured Options (One per line)</label>
                                    <textarea
                                      value={fieldFormData.options}
                                      onChange={(e) => setFieldFormData(prev => ({ ...prev, options: e.target.value }))}
                                      placeholder="Option A&#10;Option B&#10;Option C"
                                      style={{ width: '100%', minHeight: '60px', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '13px', outline: 'none' }}
                                      required
                                    />
                                  </div>
                                )}

                                {/* Advanced validations */}
                                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '8px', color: 'var(--primary-start)' }}>🛠️ Dynamic Input Validation Rules</span>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {fieldFormData.type === 'number' ? (
                                      <>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Min Range</label>
                                          <input type="number" value={fieldFormData.validationMin} onChange={e => setFieldFormData(prev => ({ ...prev, validationMin: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', outline: 'none' }} />
                                        </div>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Max Range</label>
                                          <input type="number" value={fieldFormData.validationMax} onChange={e => setFieldFormData(prev => ({ ...prev, validationMax: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', outline: 'none' }} />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Min Length</label>
                                          <input type="number" value={fieldFormData.validationMinLength} onChange={e => setFieldFormData(prev => ({ ...prev, validationMinLength: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', outline: 'none' }} />
                                        </div>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Max Length</label>
                                          <input type="number" value={fieldFormData.validationMaxLength} onChange={e => setFieldFormData(prev => ({ ...prev, validationMaxLength: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', outline: 'none' }} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div style={{ marginTop: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Regex Validation Pattern</label>
                                    <input type="text" value={fieldFormData.validationPattern} onChange={e => setFieldFormData(prev => ({ ...prev, validationPattern: e.target.value }))} placeholder="e.g. ^[A-Z]{3}-\d{4}$" style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', outline: 'none' }} />
                                  </div>
                                </div>

                                {/* Security and formatting */}
                                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '8px', color: 'var(--success)' }}>🔐 Security & White-Label Masking</span>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '8px', alignItems: 'center' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: '10px', marginBottom: '2px' }}>Storage Type</label>
                                      <select value={fieldFormData.securityStoreType} onChange={e => setFieldFormData(prev => ({ ...prev, securityStoreType: e.target.value }))} style={{ width: '100%', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '11px', outline: 'none' }}>
                                        <option value="normal">Normal (Cleartext)</option>
                                        <option value="encrypt">AES-256 Encrypted</option>
                                        <option value="hash">SHA-256 One-way Hash</option>
                                      </select>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer', marginTop: '12px' }}>
                                      <input type="checkbox" checked={fieldFormData.securityMaskValue} onChange={e => setFieldFormData(prev => ({ ...prev, securityMaskValue: e.target.checked }))} />
                                      Mask Output
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer', marginTop: '12px' }}>
                                      <input type="checkbox" checked={fieldFormData.securityShowHideToggle} onChange={e => setFieldFormData(prev => ({ ...prev, securityShowHideToggle: e.target.checked }))} />
                                      Show Hide Toggle
                                    </label>
                                  </div>
                                </div>

                                {/* Status, Readonly, Hidden checkbox list */}
                                <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={fieldFormData.required} onChange={e => setFieldFormData(prev => ({ ...prev, required: e.target.checked }))} />
                                    Required in Forms
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={fieldFormData.readOnly} onChange={e => setFieldFormData(prev => ({ ...prev, readOnly: e.target.checked }))} />
                                    Read-Only (Lock Input)
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={fieldFormData.hidden} onChange={e => setFieldFormData(prev => ({ ...prev, hidden: e.target.checked }))} />
                                    Hidden Parameter
                                  </label>
                                  <div>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      Order:
                                      <input type="number" value={fieldFormData.order} onChange={e => setFieldFormData(prev => ({ ...prev, order: e.target.value }))} style={{ width: '60px', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-dark)', fontSize: '12px', textAlign: 'center', outline: 'none' }} />
                                    </label>
                                  </div>
                                </div>

                                {/* Form Actions */}
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setShowFieldForm(false)}
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 16px', fontSize: '13px' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ padding: '8px 20px', fontSize: '13px' }}
                                  >
                                    {editingFieldId ? '💾 Update Configuration' : '✨ Add Custom Field'}
                                  </button>
                                </div>
                              </div>
                            </form>
                          ) : (
                            <div className="glass-panel" style={{ padding: '24px', textAlign: 'left', minHeight: '300px' }}>
                              <span className="badge" style={{ marginBottom: '8px' }}>Preview Simulator</span>
                              <h4 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0' }}>Live Rendering Engine</h4>
                              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 24px 0', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                                Visually test your dynamic fields layout simulator exactly as members see it.
                              </p>

                              {adminFields.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                                  🎨 Create custom fields on the left to activate preview rendering.
                                </div>
                              ) : (
                                <div style={{ border: '1px dashed var(--border)', padding: '20px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.01)' }}>
                                  <MascDynamicForm
                                    fields={adminFields}
                                    values={{}}
                                    onChange={() => {}}
                                    disabled={false}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    )}

                    {/* 7. AI Security Hub Tab - Phase 8 */}
                    {adminTab === 'ai-hub' && (
                      <div>
                        {/* Summary Metrics & AI Advisory Dashboard */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', marginBottom: '32px', alignItems: 'stretch' }}>
                          
                          {/* Left Card: Glassmorphic Threat Level Gauge */}
                          <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', minHeight: '340px' }}>
                            <div>
                              <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.2)', color: 'var(--primary-start)' }}>
                                Security Threat Level
                              </span>
                              <h3 style={{ fontSize: '24px', fontWeight: '800', margin: '12px 0 6px' }}>Platform Risk Index</h3>
                              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>Heuristic threat evaluation across user activity parameters.</p>
                            </div>

                            {/* Threat Level Dial Gauge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', margin: '24px 0' }}>
                              <div style={{
                                width: '130px',
                                height: '130px',
                                borderRadius: '50%',
                                border: '8px solid var(--border)',
                                borderTopColor: 
                                  !aiSummary ? 'var(--text-muted)' :
                                  aiSummary.platformRiskScore >= 81 ? '#EF4444' :
                                  aiSummary.platformRiskScore >= 61 ? '#F59E0B' :
                                  aiSummary.platformRiskScore >= 31 ? '#3B82F6' : '#10B981',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.02)',
                                boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.1)'
                              }}>
                                <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-dark)' }}>
                                  {aiSummary ? aiSummary.platformRiskScore : 0}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                  Risk Score
                                </span>
                              </div>

                              <div>
                                <span style={{
                                  fontSize: '18px',
                                  fontWeight: '800',
                                  color: 
                                    !aiSummary ? 'var(--text-dark)' :
                                    aiSummary.platformRiskScore >= 81 ? '#EF4444' :
                                    aiSummary.platformRiskScore >= 61 ? '#F59E0B' :
                                    aiSummary.platformRiskScore >= 31 ? '#3B82F6' : '#10B981',
                                  textTransform: 'uppercase',
                                  display: 'block',
                                  marginBottom: '8px'
                                }}>
                                  {!aiSummary ? 'Offline' :
                                   aiSummary.platformRiskScore >= 81 ? '🔥 Critical Threat' :
                                   aiSummary.platformRiskScore >= 61 ? '⚠️ Suspicious' :
                                   aiSummary.platformRiskScore >= 31 ? '🔍 Moderate Risk' : '✅ Platform Safe'}
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', lineHeight: '1.4' }}>
                                  {aiSummary?.unresolvedCount || 0} unresolved anomaly logs currently require administrator evaluation.
                                </span>
                              </div>
                            </div>

                            {/* Mini Category Breakdown */}
                            <div className="masc-grid-3col" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>CRITICAL</span>
                                <strong style={{ fontSize: '16px', color: '#EF4444' }}>{aiSummary?.criticalCount || 0}</strong>
                              </div>
                              <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>SUSPICIOUS</span>
                                <strong style={{ fontSize: '16px', color: '#F59E0B' }}>{aiSummary?.suspiciousCount || 0}</strong>
                              </div>
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>MODERATE</span>
                                <strong style={{ fontSize: '16px', color: '#3B82F6' }}>{aiSummary?.moderateCount || 0}</strong>
                              </div>
                            </div>

                          </div>

                          {/* Right Card: AI Natural Language Recommendation Checklist */}
                          <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>🤖 AI Security Advisor</h4>
                                <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                  Real-time Gemini Insight
                                </span>
                              </div>

                              <p style={{
                                fontSize: '13px',
                                color: 'var(--text-muted)',
                                fontStyle: 'italic',
                                background: 'rgba(255,255,255,0.01)',
                                borderLeft: '3px solid var(--primary-start)',
                                padding: '12px',
                                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                                marginBottom: '20px',
                                lineHeight: '1.5'
                              }}>
                                "{aiRecs?.aiSummary || 'Awaiting platform risk score telemetry to compile smart security summary...'}"
                              </p>

                              {/* Checklist */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {aiRecs?.recommendations && aiRecs.recommendations.map((rec) => (
                                  <div key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-dark)' }}>✅ {rec.text}</span>
                                    <span style={{
                                      fontSize: '9px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      textTransform: 'uppercase',
                                      fontWeight: '700',
                                      background: rec.priority === 'high' ? 'rgba(239, 68, 68, 0.1)' : rec.priority === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                      color: rec.priority === 'high' ? '#EF4444' : rec.priority === 'medium' ? '#F59E0B' : '#3B82F6'
                                    }}>
                                      {rec.priority}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                              <button onClick={fetchAiData} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }}>
                                🔄 Refresh AI Summary
                              </button>
                            </div>

                          </div>

                        </div>

                        {/* Policy Engine Card */}
                        <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', marginBottom: '32px' }}>
                          <h4 style={{ fontSize: '18px', fontWeight: '750', marginBottom: '8px', color: 'var(--text-dark)' }}>
                            🛡️ MASC Security Adaptive Policy Engine
                          </h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px', lineHeight: '1.5' }}>
                            Configure the zero-trust authentication actions corresponding to threat levels scored by the AI risk analyzer.
                          </p>

                          <form onSubmit={handlePolicySave}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                  Low Threat Level Action (Score 0-34)
                                </label>
                                <select
                                  name="lowRiskPolicy"
                                  value={brandEdit.lowRiskPolicy}
                                  onChange={handleEditChange}
                                  style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontWeight: '600' }}
                                >
                                  <option value="allow">✅ Allow Access</option>
                                  <option value="otp">📱 Require Mobile OTP Verification</option>
                                  <option value="email">✉️ Require Email Verification</option>
                                  <option value="both">🔐 Require Both OTP &amp; Email Verification</option>
                                  <option value="block">🚫 Block Access</option>
                                </select>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                  Medium Threat Level Action (Score 35-74)
                                </label>
                                <select
                                  name="mediumRiskPolicy"
                                  value={brandEdit.mediumRiskPolicy}
                                  onChange={handleEditChange}
                                  style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontWeight: '600' }}
                                >
                                  <option value="allow">✅ Allow Access</option>
                                  <option value="otp">📱 Require Mobile OTP Verification</option>
                                  <option value="email">✉️ Require Email Verification</option>
                                  <option value="both">🔐 Require Both OTP &amp; Email Verification</option>
                                  <option value="block">🚫 Block Access</option>
                                </select>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                  High Threat Level Action (Score 75-100)
                                </label>
                                <select
                                  name="highRiskPolicy"
                                  value={brandEdit.highRiskPolicy}
                                  onChange={handleEditChange}
                                  style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontWeight: '600' }}
                                >
                                  <option value="allow">✅ Allow Access</option>
                                  <option value="otp">📱 Require Mobile OTP Verification</option>
                                  <option value="email">✉️ Require Email Verification</option>
                                  <option value="both">🔐 Require Both OTP &amp; Email Verification</option>
                                  <option value="block">🚫 Block Access</option>
                                </select>
                              </div>

                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '20px', marginBottom: '16px', width: '100%' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: '700', color: 'var(--text-dark)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  name="verifySessionOnEachRequest"
                                  checked={brandEdit.verifySessionOnEachRequest}
                                  onChange={handleEditChange}
                                  style={{ width: '16px', height: '16px' }}
                                />
                                🔒 Verify Parameters on Every Request (Continuous Zero-Trust Verification)
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: '700', color: 'var(--text-dark)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  name="allowConcurrentSessions"
                                  checked={brandEdit.allowConcurrentSessions !== undefined ? brandEdit.allowConcurrentSessions : true}
                                  onChange={handleEditChange}
                                  style={{ width: '16px', height: '16px' }}
                                />
                                💻 Allow Concurrent Multi-Device Sessions
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: '700', color: 'var(--text-dark)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  name="requirePhysicalLocation"
                                  checked={brandEdit.requirePhysicalLocation || false}
                                  onChange={handleEditChange}
                                  style={{ width: '16px', height: '16px' }}
                                />
                                📍 Require Actual Physical Geo-location (GPS/Wi-Fi prompt on Login)
                              </label>

                              {/* Session Timeout Control */}
                              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-dark)', marginBottom: '10px' }}>
                                  ⏱️ User Session Timeout Duration
                                  <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                    (applies to new logins — existing sessions keep their original expiry)
                                  </span>
                                </label>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {[
                                    { label: '1 Hour', value: 1 },
                                    { label: '4 Hours', value: 4 },
                                    { label: '8 Hours', value: 8 },
                                    { label: '12 Hours', value: 12 },
                                    { label: '24 Hours', value: 24 },
                                    { label: '48 Hours', value: 48 },
                                    { label: '7 Days', value: 168 },
                                    { label: '30 Days', value: 720 }
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setBrandEdit(prev => ({ ...prev, sessionTimeoutHours: opt.value }))}
                                      style={{
                                        padding: '6px 14px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer',
                                        border: brandEdit.sessionTimeoutHours === opt.value
                                          ? '2px solid var(--primary-start)'
                                          : '1px solid var(--border)',
                                        background: brandEdit.sessionTimeoutHours === opt.value
                                          ? 'rgba(124, 58, 237, 0.12)'
                                          : 'rgba(255,255,255,0.03)',
                                        color: brandEdit.sessionTimeoutHours === opt.value
                                          ? 'var(--primary-start)'
                                          : 'var(--text-muted)',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                      type="number"
                                      min="1"
                                      max="720"
                                      value={brandEdit.sessionTimeoutHours || 24}
                                      onChange={(e) => setBrandEdit(prev => ({ ...prev, sessionTimeoutHours: Number(e.target.value) }))}
                                      style={{
                                        width: '70px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: 'var(--text-dark)',
                                        outline: 'none'
                                      }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>hrs custom</span>
                                  </div>
                                </div>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', margin: '8px 0 0 0' }}>
                                  Current: <strong style={{ color: 'var(--text-dark)' }}>
                                    {brandEdit.sessionTimeoutHours >= 168
                                      ? `${Math.round(brandEdit.sessionTimeoutHours / 24)} days`
                                      : `${brandEdit.sessionTimeoutHours || 24} hours`}
                                  </strong>
                                </p>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                              <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px' }}>
                                💾 Save Policy Rules
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* Custom ML Model Training Dashboard */}
                        <div className="glass-panel" style={{ padding: '32px', textAlign: 'left', marginBottom: '32px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                              <h4 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: 'var(--text-dark)' }}>
                                🧠 Custom ML Model Training Dashboard
                              </h4>
                              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                                Train Random Forest Classifiers and Isolation Forest models inside the Python virtual environment on 1,000+ behavior vectors.
                              </p>
                            </div>
                            <button
                              onClick={handleTrainModel}
                              disabled={trainingLoading}
                              className="btn btn-primary"
                              style={{ padding: '10px 20px', fontSize: '13px' }}
                            >
                              {trainingLoading ? '⏳ Training Forest Trees...' : '⚡ Generate Dataset & Train AI'}
                            </button>
                          </div>

                          {trainingError && (
                            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px', marginTop: '16px', fontWeight: '500' }}>
                              ⚠️ Training Failed: {trainingError}
                            </div>
                          )}

                          {trainingSummary ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '24px', animation: 'fadeIn 0.3s ease-out' }}>
                              {/* Model Status & Stats */}
                              <div className="masc-grid-4col">
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>ACCURACY</span>
                                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--success)', marginTop: '4px' }}>
                                    {(trainingSummary.metrics.accuracy * 100).toFixed(1)}%
                                  </div>
                                </div>
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>PRECISION</span>
                                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary-start)', marginTop: '4px' }}>
                                    {(trainingSummary.metrics.precision * 100).toFixed(1)}%
                                  </div>
                                </div>
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>RECALL</span>
                                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--warning)', marginTop: '4px' }}>
                                    {(trainingSummary.metrics.recall * 100).toFixed(1)}%
                                  </div>
                                </div>
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>F1-SCORE</span>
                                  <div style={{ fontSize: '24px', fontWeight: '800', color: '#10B981', marginTop: '4px' }}>
                                    {(trainingSummary.metrics.f1_score * 100).toFixed(1)}%
                                  </div>
                                </div>
                              </div>

                              {/* Matrix and Feature Importances */}
                              <div className="masc-grid-2col-split">
                                {/* Confusion Matrix */}
                                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    📊 Classification Confusion Matrix
                                  </strong>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'center' }}>
                                    <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>True Negatives (Safe Allowed)</span>
                                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--success)' }}>{trainingSummary.metrics.confusion_matrix.tn}</span>
                                    </div>
                                    <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>False Positives (False Alarms)</span>
                                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--danger)' }}>{trainingSummary.metrics.confusion_matrix.fp}</span>
                                    </div>
                                    <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>False Negatives (Missed Threat)</span>
                                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--danger)' }}>{trainingSummary.metrics.confusion_matrix.fn}</span>
                                    </div>
                                    <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 'var(--radius-sm)' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>True Positives (Attacks Blocked)</span>
                                      <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--success)' }}>{trainingSummary.metrics.confusion_matrix.tp}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Feature Importance */}
                                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    📈 Model Feature Weighting Priorities
                                  </strong>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {Object.entries(trainingSummary.feature_importance).sort((a,b) => b[1]-a[1]).map(([feature, weight]) => (
                                      <div key={feature}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                                          <span style={{ textTransform: 'uppercase', fontWeight: '600' }}>
                                            {feature.replace(/_/g, ' ')}
                                          </span>
                                          <strong>{(weight * 100).toFixed(1)}%</strong>
                                        </div>
                                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                          <div style={{ width: `${weight * 100}%`, height: '100%', background: 'var(--primary-gradient)', borderRadius: '3px' }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '13px', background: 'rgba(255,255,255,0.01)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginTop: '20px' }}>
                              📊 No custom model weights deployed yet. Click "Generate Dataset & Train AI" to execute virtual environment learning.
                            </div>
                          )}
                        </div>

                        {/* Recent Platform Alerts Table */}
                        <div className="glass-panel" style={{ padding: '32px', textAlign: 'left' }}>
                          <h4 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                            Recent AI Threat Observations
                          </h4>



                          {aiLoading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}>
                              <div className="status-dot online" style={{ width: '12px', height: '12px', margin: '0 auto 16px' }}></div>
                              <p style={{ color: 'var(--text-muted)' }}>Analyzing observations feed...</p>
                            </div>
                          ) : aiAlerts.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No AI Threat Observations logged. Platform is completely secure.</p>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px' }}>Timestamp</th>
                                    <th style={{ padding: '12px' }}>User Context</th>
                                    <th style={{ padding: '12px' }}>Anomaly Action</th>
                                    <th style={{ padding: '12px' }}>Score</th>
                                    <th style={{ padding: '12px' }}>Details / Observations</th>
                                    <th style={{ padding: '12px' }}>Mitigation Recommendation</th>
                                    <th style={{ padding: '12px' }}>Resolution Status</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {aiAlerts.map((alert) => (
                                    <tr key={alert._id} style={{ borderBottom: '1px solid var(--border)', background: alert.status !== 'pending' ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                      <td style={{ padding: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {new Date(alert.createdAt).toLocaleString()}
                                      </td>
                                      <td style={{ padding: '12px', fontWeight: '500' }}>
                                        {alert.email || 'System Anomaly'}
                                      </td>
                                      <td style={{ padding: '12px' }}>
                                        <span style={{
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          background: 'rgba(255,255,255,0.03)',
                                          border: '1px solid var(--border)',
                                          textTransform: 'uppercase'
                                        }}>
                                          {alert.action}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px' }}>
                                        <span style={{
                                          fontWeight: '800',
                                          color: 
                                            alert.severity === 'critical' ? '#EF4444' :
                                            alert.severity === 'suspicious' ? '#F59E0B' :
                                            alert.severity === 'moderate' ? '#3B82F6' : '#10B981'
                                        }}>
                                          {alert.score}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px', maxWidth: '300px', lineHeight: '1.4' }}>
                                        {alert.description}
                                      </td>
                                      <td style={{ padding: '12px', maxWidth: '250px', fontStyle: 'italic', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                        {alert.recommendation || 'No manual mitigation suggested.'}
                                      </td>
                                      <td style={{ padding: '12px' }}>
                                        <span style={{
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                          fontWeight: '600',
                                          textTransform: 'uppercase',
                                          background: alert.status === 'resolved' ? 'rgba(16, 185, 129, 0.1)' : alert.status === 'dismissed' ? 'rgba(107, 114, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                          color: alert.status === 'resolved' ? '#10B981' : alert.status === 'dismissed' ? '#6B7280' : '#EF4444'
                                        }}>
                                          {alert.status}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {alert.status === 'pending' && (
                                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                            <button
                                              onClick={() => handleUpdateAlertStatus(alert._id, 'resolved')}
                                              className="btn btn-primary"
                                              style={{ padding: '4px 8px', fontSize: '11px' }}
                                            >
                                              Resolve
                                            </button>
                                            <button
                                              onClick={() => handleUpdateAlertStatus(alert._id, 'dismissed')}
                                              className="btn btn-secondary"
                                              style={{ padding: '4px 8px', fontSize: '11px' }}
                                            >
                                              Dismiss
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                        </div>

                      </div>
                    )}
                  </div>
                )
              )}

              {/* 9. Vault Governance Tab */}
              {portalMode === 'admin' && admin && adminTab === 'vault-governance' && (
                <div>
                  <div className="glass-panel" style={{ padding: '28px', marginBottom: '24px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '22px', fontWeight: '800', margin: 0, background: 'linear-gradient(135deg, #7C3AED, #A855F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          🔐 Vault Governance Control Center
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                          Manage Vault Clusters, Collections, User Sets, Block Rules &amp; Permissions across the secure data layer.
                        </p>
                      </div>
                      <button onClick={fetchVaultGovernance} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                        🔄 Refresh
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      {[
                        { key: 'overview', label: '📊 Overview' },
                        { key: 'collections', label: '🗂 Collections' },
                        { key: 'user-sets', label: '👥 User Sets' },
                        { key: 'blocks', label: '🚫 Block Rules' },
                        { key: 'audit', label: '📜 Vault Audit' },
                      ].map(sub => (
                        <button
                          key={sub.key}
                          onClick={() => {
                            setVaultGovSubTab(sub.key)
                            if (sub.key === 'audit') fetchVaultAuditLogs()
                          }}
                          style={{
                            padding: '6px 14px', fontSize: '12px', fontWeight: '700',
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            border: vaultGovSubTab === sub.key ? '2px solid var(--primary-start)' : '1px solid var(--border)',
                            background: vaultGovSubTab === sub.key ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                            color: vaultGovSubTab === sub.key ? 'var(--primary-start)' : 'var(--text-muted)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  </div>



                  {vaultGovLoading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                      <div className="status-dot online" style={{ width: '12px', height: '12px', margin: '0 auto 16px' }}></div>
                      Loading Vault Governance data...
                    </div>
                  ) : (
                    <>
                      {/* ── Overview ── */}
                      {vaultGovSubTab === 'overview' && (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                            {[
                              { label: 'Clusters', value: vaultClusters.length, icon: '🏗', color: '#7C3AED' },
                              { label: 'Collections', value: vaultCollections.length, icon: '🗂', color: '#8B5CF6' },
                              { label: 'User Sets', value: vaultUserSets.length, icon: '👥', color: '#A855F7' },
                              { label: 'Block Rules', value: vaultBlockRules.length, icon: '🚫', color: '#EF4444' },
                            ].map(stat => (
                              <div key={stat.label} className="glass-panel" style={{ padding: '20px', textAlign: 'left' }}>
                                <span style={{ fontSize: '24px' }}>{stat.icon}</span>
                                <div style={{ fontSize: '30px', fontWeight: '800', color: stat.color, marginTop: '8px' }}>{stat.value}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginTop: '4px' }}>{stat.label}</div>
                              </div>
                            ))}
                          </div>

                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0' }}>🏗 Vault Clusters</h4>
                            {vaultClusters.length === 0 ? (
                              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No clusters found. You can create clusters through the SDK.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {vaultClusters.map(cluster => (
                                  <div key={cluster._id} className="masc-responsive-list-item">
                                    <div>
                                      <span style={{ fontWeight: '700', fontSize: '14px' }}>{cluster.name}</span>
                                      {cluster.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>— {cluster.description}</span>}
                                      <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '3px', marginLeft: '8px', background: cluster.scopeType === 'local' ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)', color: cluster.scopeType === 'local' ? '#F59E0B' : 'var(--primary-start)', fontWeight: '750' }}>
                                        {cluster.scopeType?.toUpperCase()}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <code style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>{cluster._id}</code>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(cluster.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Collections ── */}
                      {vaultGovSubTab === 'collections' && (
                        <div className="masc-grid-sidebar" style={{ alignItems: 'stretch' }}>
                          
                          {/* Tree Directory Column */}
                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>📂 Vault Explorer</h4>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Interactive Tree</span>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '600px', padding: '4px', background: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                              
                              {/* Root Node */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '750', padding: '6px 8px', borderRadius: '4px', background: 'rgba(124,58,237,0.06)' }}>
                                <span>🌐</span>
                                <span style={{ color: 'var(--primary-start)' }}>MASC Secure Vault Storage</span>
                              </div>

                              {/* Clusters (Level 1) */}
                              <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {vaultClusters.length === 0 ? (
                                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>No Clusters Found</p>
                                ) : (
                                  vaultClusters.map(cluster => {
                                    const isClusterExpanded = expandedFolders.has(cluster._id);
                                    const isSelected = selectedCluster?._id === cluster._id;
                                    
                                    return (
                                      <div key={cluster._id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {/* Cluster Node Row */}
                                        <div 
                                          onClick={() => {
                                            setSelectedCluster(cluster);
                                            setSelectedCollection(null);
                                            setSelectedRecord(null);
                                            setOverrideForm({ granteeType: 'user', granteeId: '' });
                                            setExpandedFolders(prev => {
                                              const n = new Set(prev);
                                              if (n.has(cluster._id)) n.delete(cluster._id);
                                              else n.add(cluster._id);
                                              return n;
                                            });
                                          }}
                                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 8px', borderRadius: '4px', background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent', transition: 'background 0.1s' }}
                                        >
                                          <span style={{ fontSize: '12px' }}>{isClusterExpanded ? '📂' : '📁'}</span>
                                          <span style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? 'var(--primary-start)' : 'var(--text-dark)' }}>{cluster.name}</span>
                                          {(() => {
                                            const isLocal = cluster.scopeType === 'local';
                                            return (
                                              <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '3px', marginLeft: 'auto', background: isLocal ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)', color: isLocal ? '#F59E0B' : 'var(--primary-start)', fontWeight: '750' }}>
                                                {isLocal ? 'LOCAL' : 'GLOBAL'}
                                              </span>
                                            );
                                          })()}
                                        </div>

                                        {/* Collections inside this Cluster (Level 2) */}
                                        {isClusterExpanded && (
                                          <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: '6px' }}>
                                            {vaultCollections.filter(col => col.clusterId?._id === cluster._id || (col.clusterId && col.clusterId === cluster._id || (col.clusterId?._id === undefined && col.clusterId === cluster._id))).length === 0 ? (
                                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>No Collections</p>
                                            ) : (
                                              vaultCollections.filter(col => col.clusterId?._id === cluster._id || (col.clusterId && col.clusterId === cluster._id || (col.clusterId?._id === undefined && col.clusterId === cluster._id))).map(col => {
                                                const isColExpanded = expandedFolders.has(col._id);
                                                const isColSelected = selectedCollection?._id === col._id;
                                                
                                                return (
                                                  <div key={col._id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    {/* Collection Node Row */}
                                                    <div
                                                      onClick={() => {
                                                        setSelectedCluster(null);
                                                        setSelectedCollection(col);
                                                        setSelectedRecord(null);
                                                        setOverrideForm({ granteeType: 'user', granteeId: '' });
                                                        if (!isColExpanded) {
                                                          fetchCollectionRecords(col._id);
                                                        }
                                                        setExpandedFolders(prev => {
                                                          const n = new Set(prev);
                                                          if (n.has(col._id)) n.delete(col._id);
                                                          else n.add(col._id);
                                                          return n;
                                                        });
                                                      }}
                                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '5px 8px', borderRadius: '4px', background: isColSelected ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                                                    >
                                                      <span style={{ fontSize: '12px' }}>{isColExpanded ? '📂' : '📁'}</span>
                                                      <span style={{ fontSize: '12px', fontWeight: '600', color: isColSelected ? '#8B5CF6' : 'var(--text-muted)' }}>{col.name}</span>
                                                      {(() => {
                                                        const isLocal = cluster.scopeType === 'local';
                                                        return (
                                                          <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '3px', marginLeft: 'auto', background: isLocal ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)', color: isLocal ? '#F59E0B' : 'var(--primary-start)', fontWeight: '750' }}>
                                                            {isLocal ? 'LOCAL' : 'GLOBAL'}
                                                          </span>
                                                        );
                                                      })()}
                                                    </div>

                                                    {/* Records inside this Collection (Level 3) */}
                                                    {isColExpanded && (
                                                      <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: '6px' }}>
                                                        {collectionRecordsLoading && selectedCollection?._id === col._id ? (
                                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>Loading...</div>
                                                        ) : (
                                                          collectionRecords.length === 0 ? (
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>Empty Collection</div>
                                                          ) : (
                                                            collectionRecords.map(rec => {
                                                              const isRecSelected = selectedRecord?._id === rec._id;
                                                              return (
                                                                <div
                                                                  key={rec._id}
                                                                  onClick={() => {
                                                                    setSelectedCluster(null);
                                                                    setSelectedCollection(null);
                                                                    setSelectedRecord(rec);
                                                                    fetchRecordDetails(rec._id);
                                                                  }}
                                                                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', background: isRecSelected ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                                                                >
                                                                  <span>📄</span>
                                                                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: isRecSelected ? '#F59E0B' : 'var(--text-muted)' }}>
                                                                    {rec._id?.toString()?.slice(-12)}
                                                                  </span>
                                                                  {(() => {
                                                                    const isLocal = cluster.scopeType === 'local';
                                                                    return (
                                                                      <span style={{ fontSize: '7px', padding: '1px 3px', borderRadius: '3px', marginLeft: 'auto', background: isLocal ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)', color: isLocal ? '#F59E0B' : 'var(--primary-start)', fontWeight: '750' }}>
                                                                        {isLocal ? 'LOCAL' : 'GLOBAL'}
                                                                      </span>
                                                                    );
                                                                  })()}
                                                                </div>
                                                              );
                                                            })
                                                          )
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Inspector Side Column */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Empty / Placeholder State */}
                            {!selectedCluster && !selectedCollection && !selectedRecord && (
                              <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '48px' }}>🔍</div>
                                <h4 style={{ margin: 0, fontWeight: '750' }}>No Selected Resource</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '320px', margin: 0 }}>
                                  Expand a folder in the Explorer tree on the left and select any Cluster, Collection, or Record file to inspect.
                                </p>
                              </div>
                            )}

                            {/* Cluster Inspector */}
                            {selectedCluster && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>🏗 Cluster: {selectedCluster.name}</h4>
                                    <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(124,58,237,0.1)', color: 'var(--primary-start)', borderRadius: '20px', fontWeight: '700' }}>CLUSTER</span>
                                  </div>
                                  <div className="masc-grid-meta-cols">
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>STATUS</p>
                                      <span style={{ fontWeight: '750', color: selectedCluster.blocked ? 'var(--danger)' : 'var(--success)' }}>
                                        {selectedCluster.blocked ? '🚫 BLOCKED' : '✅ ACTIVE'}
                                      </span>
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>VAULT OWNER</p>
                                      {selectedCluster.userInfo ? (
                                        <span style={{ fontWeight: '700', color: '#F59E0B' }}>
                                          {selectedCluster.userInfo.name} ({selectedCluster.userInfo.email})
                                        </span>
                                      ) : (
                                        <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '3px' }}>{selectedCluster.vaultId || 'N/A'}</code>
                                      )}
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>SCOPE TYPE</p>
                                      {(() => {
                                        const isLocal = selectedCluster.scopeType === 'local';
                                        return (
                                          <span style={{ fontWeight: '750', color: isLocal ? '#F59E0B' : 'var(--primary-start)' }}>
                                            {isLocal ? '🔒 LOCAL VAULT' : '🌐 GLOBAL SYSTEM'}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>CREATED AT</p>
                                      <span>{new Date(selectedCluster.createdAt).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <div style={{ marginBottom: '16px' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>DESCRIPTION</p>
                                    <p style={{ fontSize: '13px', margin: 0 }}>{selectedCluster.description || 'No description provided.'}</p>
                                  </div>

                                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', gap: '10px' }}>
                                    <button
                                      onClick={() => handleToggleClusterBlock(selectedCluster._id, selectedCluster.blocked)}
                                      className="btn btn-secondary"
                                      style={{ padding: '8px 16px', fontSize: '12px', border: selectedCluster.blocked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: selectedCluster.blocked ? 'var(--success)' : 'var(--danger)', cursor: 'pointer' }}
                                    >
                                      {selectedCluster.blocked ? '🔓 Unblock Cluster' : '🚫 Block Cluster'}
                                    </button>
                                  </div>

                                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                    <h5 style={{ fontSize: '12px', fontWeight: '850', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>🔑 Access Permissions Matrix</h5>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {/* Users list */}
                                      {(() => {
                                        const list = [...(selectedCluster.permissions?.users || [])];
                                        if (selectedCluster.scopeType === 'local' && selectedCluster.userInfo) {
                                          const ownerId = selectedCluster.userInfo._id;
                                          const hasOwner = list.some(u => {
                                            const uid = u.userId?._id || u.userId;
                                            return uid.toString() === ownerId.toString();
                                          });
                                          if (!hasOwner) {
                                            list.push({
                                              userId: selectedCluster.userInfo,
                                              actions: ['read', 'create', 'update', 'delete']
                                            });
                                          }
                                        }
                                        return list;
                                      })().map((up, i) => {
                                        const u = up.userId;
                                        const isPop = u && typeof u === 'object';
                                        const id = isPop ? u._id : up.userId;
                                        const name = isPop ? `${u.firstName} ${u.lastName} (${u.email})` : up.userId?.toString()?.slice(-8);
                                        const userInList = usersList.find(usr => usr.email === u?.email || usr._id === id);
                                        const isManagerUser = (isPop && u.role === 'manager') || (userInList && userInList.role === 'manager');
                                        const isSelfUser = id === admin?._id || u?.email === admin?.email;
                                        const cannotEditUser = admin?.role === 'manager' && (isManagerUser || isSelfUser);

                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: '6px' }}>
                                            <div className="masc-responsive-user-row">
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)', wordBreak: 'break-word' }}>👤 User: {name}</span>
                                              {selectedCluster.scopeType !== 'local' && !cannotEditUser && (
                                                <button
                                                  onClick={() => handleRemoveOverride('cluster', selectedCluster._id, 'user', id, up.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = up.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditUser ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditUser}
                                                      onChange={(e) => handleCheckboxChange('cluster', selectedCluster._id, 'user', id, act, up.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* User Sets list */}
                                      {selectedCluster.permissions?.userSets?.map((us, i) => {
                                        const usObj = us.userSetId;
                                        const isPop = usObj && typeof usObj === 'object';
                                        const id = isPop ? usObj._id : us.userSetId;
                                        const name = isPop ? usObj.name : us.userSetId?.toString()?.slice(-8);
                                        const containsManager = (() => {
                                          const fullSet = vaultUserSets.find(set => set._id === id);
                                          if (!fullSet || !fullSet.members) return false;
                                          return fullSet.members.some(memberId => {
                                            const memberUserObj = usersList.find(usr => usr._id === memberId || usr._id === (memberId?._id || memberId));
                                            if (!memberUserObj) return false;
                                            const isSelf = memberUserObj.email === admin?.email || memberUserObj._id === admin?._id;
                                            const isManager = memberUserObj.role === 'manager';
                                            return isSelf || isManager;
                                          });
                                        })();
                                        const cannotEditUserSet = admin?.role === 'manager' && containsManager;
                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)' }}>👥 Set: {name}</span>
                                              {!cannotEditUserSet && (
                                                <button
                                                  onClick={() => handleRemoveOverride('cluster', selectedCluster._id, 'userSet', id, us.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = us.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditUserSet ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditUserSet}
                                                      onChange={(e) => handleCheckboxChange('cluster', selectedCluster._id, 'userSet', id, act, us.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Roles list */}
                                      {selectedCluster.permissions?.roles?.map((rp, i) => {
                                        const isAdminRole = rp.role === 'admin';
                                        const isManagerRole = rp.role === 'manager';
                                        const cannotEditRole = isAdminRole || (admin.role === 'manager' && isManagerRole);
                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)' }}>🎭 Role: {rp.role?.toUpperCase()}</span>
                                              {!cannotEditRole && (
                                                <button
                                                  onClick={() => handleRemoveOverride('cluster', selectedCluster._id, 'role', rp.role, rp.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = isAdminRole ? true : rp.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditRole ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditRole}
                                                      onChange={(e) => handleCheckboxChange('cluster', selectedCluster._id, 'role', rp.role, act, rp.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}


                                      {/* Add override block */}
                                      {(() => {
                                        const isLocal = selectedCluster.scopeType === 'local';
                                        const activeGranteeType = isLocal
                                          ? (overrideForm.granteeType === 'userSet' ? 'role' : overrideForm.granteeType)
                                          : overrideForm.granteeType;
                                        
                                        return (
                                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>➕ ADD OVERRIDE</span>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                              <select value={activeGranteeType} onChange={e => setOverrideForm(p => ({ ...p, granteeType: e.target.value, granteeId: '' }))}
                                                style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px' }}>
                                                <option value="user">User</option>
                                                {!isLocal && <option value="userSet">User Set</option>}
                                                <option value="role">Role</option>
                                              </select>
                                              
                                              {(activeGranteeType === 'user') ? (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select User --</option>
                                                  {usersList.filter(u => u.role !== 'admin' && (!isLocal || u.role === 'manager')).map(u => <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                                </select>
                                              ) : (activeGranteeType === 'userSet') ? (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select User Set --</option>
                                                  {vaultUserSets.map(us => <option key={us._id} value={us._id}>{us.name}</option>)}
                                                </select>
                                              ) : (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select Role --</option>
                                                  {isLocal ? (
                                                    <>
                                                      <option value="admin">ADMIN</option>
                                                      <option value="manager">MANAGER</option>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <option value="manager">MANAGER</option>
                                                      <option value="user">USER</option>
                                                    </>
                                                  )}
                                                </select>
                                              )}
                                              
                                              <button onClick={() => handleAddOverride('cluster', selectedCluster._id)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                                Add
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Collection Inspector */}
                            {selectedCollection && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>🗂 Collection: {selectedCollection.name}</h4>
                                    <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', borderRadius: '20px', fontWeight: '700' }}>COLLECTION</span>
                                  </div>
                                  
                                  <div className="masc-grid-meta-cols">
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>STATUS</p>
                                      <span style={{ fontWeight: '700', color: selectedCollection.blocked ? 'var(--danger)' : 'var(--success)' }}>
                                        {selectedCollection.blocked ? '🚫 BLOCKED' : '✅ ACTIVE'}
                                      </span>
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>SCOPE TYPE</p>
                                      {(() => {
                                        const clusterId = selectedCollection.clusterId?._id || selectedCollection.clusterId;
                                        const parentCluster = vaultClusters.find(c => c._id === clusterId) || selectedCollection.clusterId;
                                        const isLocal = parentCluster?.scopeType === 'local';
                                        return (
                                          <span style={{ fontWeight: '750', color: isLocal ? '#F59E0B' : 'var(--primary-start)' }}>
                                            {isLocal ? '🔒 LOCAL' : '🌐 GLOBAL'}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>RECORDS</p>
                                      <span>{selectedCollection.recordCount || 0} records</span>
                                    </div>
                                    <div>
                                      <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>ID</p>
                                      <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '3px' }}>{selectedCollection._id}</code>
                                    </div>
                                  </div>

                                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px', display: 'flex', gap: '10px' }}>
                                    <button
                                      onClick={() => handleToggleCollectionBlock(selectedCollection._id, selectedCollection.blocked)}
                                      className="btn btn-secondary"
                                      style={{ padding: '8px 16px', fontSize: '12px', border: selectedCollection.blocked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)', color: selectedCollection.blocked ? 'var(--success)' : 'var(--danger)', cursor: 'pointer' }}
                                    >
                                      {selectedCollection.blocked ? '🔓 Unblock Collection' : '🚫 Block Collection'}
                                    </button>
                                  </div>

                                  <div style={{ marginTop: '16px', marginBottom: '24px' }}>
                                    <h5 style={{ fontSize: '12px', fontWeight: '850', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>🔑 Access Permissions Matrix</h5>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {/* Users list */}
                                      {(() => {
                                        const list = [...(selectedCollection.permissions?.users || [])];
                                        const clusterId = selectedCollection.clusterId?._id || selectedCollection.clusterId;
                                        const parentCluster = vaultClusters.find(c => c._id === clusterId) || selectedCollection.clusterId;
                                        if (parentCluster?.scopeType === 'local' && parentCluster.userInfo) {
                                          const ownerId = parentCluster.userInfo._id;
                                          const hasOwner = list.some(u => {
                                            const uid = u.userId?._id || u.userId;
                                            return uid.toString() === ownerId.toString();
                                          });
                                          if (!hasOwner) {
                                            list.push({
                                              userId: parentCluster.userInfo,
                                              actions: ['read', 'create', 'update', 'delete']
                                            });
                                          }
                                        }
                                        return list;
                                      })().map((up, i) => {
                                        const u = up.userId;
                                        const isPop = u && typeof u === 'object';
                                        const id = isPop ? u._id : up.userId;
                                        const name = isPop ? `${u.firstName} ${u.lastName} (${u.email})` : up.userId?.toString()?.slice(-8);
                                        const userInList = usersList.find(usr => usr.email === u?.email || usr._id === id);
                                        const isManagerUser = (isPop && u.role === 'manager') || (userInList && userInList.role === 'manager');
                                        const isSelfUser = id === admin?._id || u?.email === admin?.email;
                                        const cannotEditUser = admin?.role === 'manager' && (isManagerUser || isSelfUser);
                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.12)', borderRadius: '6px' }}>
                                            <div className="masc-responsive-user-row">
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)', wordBreak: 'break-word' }}>👤 User: {name}</span>
                                              {(() => {
                                                const cId = selectedCollection.clusterId?._id || selectedCollection.clusterId;
                                                const pCluster = vaultClusters.find(c => c._id === cId) || selectedCollection.clusterId;
                                                return pCluster?.scopeType !== 'local';
                                              })() && !cannotEditUser && (
                                                <button
                                                  onClick={() => handleRemoveOverride('collection', selectedCollection._id, 'user', id, up.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = up.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditUser ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditUser}
                                                      onChange={(e) => handleCheckboxChange('collection', selectedCollection._id, 'user', id, act, up.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* User Sets list */}
                                      {selectedCollection.permissions?.userSets?.map((us, i) => {
                                        const usObj = us.userSetId;
                                        const isPop = usObj && typeof usObj === 'object';
                                        const id = isPop ? usObj._id : us.userSetId;
                                        const name = isPop ? usObj.name : us.userSetId?.toString()?.slice(-8);
                                        const containsManager = (() => {
                                          const fullSet = vaultUserSets.find(set => set._id === id);
                                          if (!fullSet || !fullSet.members) return false;
                                          return fullSet.members.some(memberId => {
                                            const memberUserObj = usersList.find(usr => usr._id === memberId || usr._id === (memberId?._id || memberId));
                                            if (!memberUserObj) return false;
                                            const isSelf = memberUserObj.email === admin?.email || memberUserObj._id === admin?._id;
                                            const isManager = memberUserObj.role === 'manager';
                                            return isSelf || isManager;
                                          });
                                        })();
                                        const cannotEditUserSet = admin?.role === 'manager' && containsManager;
                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)' }}>👥 Set: {name}</span>
                                              {!cannotEditUserSet && (
                                                <button
                                                  onClick={() => handleRemoveOverride('collection', selectedCollection._id, 'userSet', id, us.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = us.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditUserSet ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditUserSet}
                                                      onChange={(e) => handleCheckboxChange('collection', selectedCollection._id, 'userSet', id, act, us.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Roles list */}
                                      {selectedCollection.permissions?.roles?.map((rp, i) => {
                                        const isAdminRole = rp.role === 'admin';
                                        const isManagerRole = rp.role === 'manager';
                                        const cannotEditRole = isAdminRole || (admin.role === 'manager' && isManagerRole);
                                        return (
                                          <div key={i} style={{ padding: '12px', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-dark)' }}>🎭 Role: {rp.role?.toUpperCase()}</span>
                                              {!cannotEditRole && (
                                                <button
                                                  onClick={() => handleRemoveOverride('collection', selectedCollection._id, 'role', rp.role, rp.actions)}
                                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px' }}
                                                >
                                                  🗑️ Remove
                                                </button>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                              {['read', 'create', 'update', 'delete'].map(act => {
                                                const isChecked = isAdminRole ? true : rp.actions.includes(act);
                                                return (
                                                  <label key={act} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: cannotEditRole ? 'not-allowed' : 'pointer', fontSize: '11px', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={isChecked}
                                                      disabled={cannotEditRole}
                                                      onChange={(e) => handleCheckboxChange('collection', selectedCollection._id, 'role', rp.role, act, rp.actions, e.target.checked)}
                                                    />
                                                    <span style={{ textTransform: 'capitalize' }}>{act}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}


                                      {/* Add override block */}
                                      {(() => {
                                        const clusterId = selectedCollection.clusterId?._id || selectedCollection.clusterId;
                                        const parentCluster = vaultClusters.find(c => c._id === clusterId) || selectedCollection.clusterId;
                                        const isLocal = parentCluster?.scopeType === 'local';
                                        const activeGranteeType = isLocal
                                          ? (overrideForm.granteeType === 'userSet' ? 'role' : overrideForm.granteeType)
                                          : overrideForm.granteeType;
                                        
                                        return (
                                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '750', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>➕ ADD OVERRIDE</span>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                              <select value={activeGranteeType} onChange={e => setOverrideForm(p => ({ ...p, granteeType: e.target.value, granteeId: '' }))}
                                                style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px' }}>
                                                <option value="user">User</option>
                                                {!isLocal && <option value="userSet">User Set</option>}
                                                <option value="role">Role</option>
                                              </select>
                                              
                                              {(activeGranteeType === 'user') ? (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select User --</option>
                                                  {usersList.filter(u => u.role !== 'admin' && (!isLocal || u.role === 'manager')).map(u => <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                                </select>
                                              ) : (activeGranteeType === 'userSet') ? (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select User Set --</option>
                                                  {vaultUserSets.map(us => <option key={us._id} value={us._id}>{us.name}</option>)}
                                                </select>
                                              ) : (
                                                <select value={overrideForm.granteeId} onChange={e => setOverrideForm(p => ({ ...p, granteeId: e.target.value }))}
                                                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '12px', flex: 1 }}>
                                                  <option value="">-- Select Role --</option>
                                                  {isLocal ? (
                                                    <>
                                                      <option value="admin">ADMIN</option>
                                                      <option value="manager">MANAGER</option>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <option value="manager">MANAGER</option>
                                                      <option value="user">USER</option>
                                                    </>
                                                  )}
                                                </select>
                                              )}
                                              
                                              <button onClick={() => handleAddOverride('collection', selectedCollection._id)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                                Add
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>


                              </div>
                            )}

                            {/* Record File Decrypted Inspector */}
                            {selectedRecord && (
                              <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '800', fontFamily: 'monospace' }}>📄 Record: {selectedRecord._id?.toString()?.slice(-12)}</h4>
                                  <span style={{ fontSize: '11px', padding: '3px 8px', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', borderRadius: '20px', fontWeight: '700' }}>RECORD</span>
                                </div>

                                <div className="masc-grid-meta-cols">
                                  <div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>OWNER / USER ID</p>
                                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '3px' }}>{selectedRecord.ownerId || 'System'}</code>
                                  </div>
                                  <div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>SCOPE TYPE</p>
                                    {(() => {
                                      const parentCollection = vaultCollections.find(c => c._id === selectedRecord.collectionId);
                                      const parentClusterId = parentCollection?.clusterId?._id || parentCollection?.clusterId;
                                      const parentCluster = vaultClusters.find(c => c._id === parentClusterId);
                                      const isLocal = parentCluster?.scopeType === 'local';
                                      return (
                                        <span style={{ fontWeight: '750', color: isLocal ? '#F59E0B' : 'var(--primary-start)' }}>
                                          {isLocal ? '🔒 LOCAL' : '🌐 GLOBAL'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  <div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>CREATED DATE</p>
                                    <span>{new Date(selectedRecord.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>

                                <div style={{ marginTop: '16px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', margin: 0 }}>🔓 Decrypted Vault Payload Data</p>
                                    <span style={{ fontSize: '10px', color: 'var(--success)', fontWeight: '750' }}>AES-256 Decrypted</span>
                                  </div>
                                  
                                  {selectedRecordLoading ? (
                                    <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                      Decrypting data with secure server keys...
                                    </div>
                                  ) : selectedRecordDetails?.data ? (
                                    <pre style={{ margin: 0, padding: '16px', background: 'var(--background)', color: '#10B981', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', maxHeight: '300px' }}>
                                      {JSON.stringify(selectedRecordDetails.data, null, 2)}
                                    </pre>
                                  ) : (
                                    <div style={{ padding: '20px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', textAlign: 'center', color: 'var(--danger)', fontSize: '12px' }}>
                                      Failed to decrypt record contents. Refer to security audit logs.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      )}

                      {/* ── User Sets ── */}
                      {vaultGovSubTab === 'user-sets' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0' }}>➕ Create User Set</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>NAME</label>
                                <input value={newUserSetName} onChange={e => setNewUserSetName(e.target.value)} placeholder="e.g. Finance Team"
                                  style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>SELECT MEMBERS (Hold Ctrl/Cmd to select multiple)</label>
                                <select multiple value={newUserSetMembers ? newUserSetMembers.split(',') : []} onChange={e => {
                                  const values = Array.from(e.target.selectedOptions, option => option.value);
                                  setNewUserSetMembers(values.join(','));
                                }}
                                  style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px', height: '80px' }}>
                                  {usersList.filter(u => u.role !== 'admin').map(u => <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                </select>
                              </div>
                            </div>
                            <button onClick={handleCreateUserSet} disabled={!newUserSetName.trim()} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }}>Create User Set</button>
                          </div>

                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0' }}>👥 User Sets ({vaultUserSets.length})</h4>
                            {vaultUserSets.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No user sets found.</p> : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {vaultUserSets.map(us => (
                                  <div key={us._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                      <div>
                                        <span style={{ fontWeight: '800', fontSize: '15px' }}>{us.name}</span>
                                        <span style={{ marginLeft: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>{us.members?.length || 0} members</span>
                                        <code style={{ marginLeft: '10px', fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>{us._id}</code>
                                      </div>
                                      <button onClick={() => handleDeleteUserSet(us._id, us.name)} className="btn btn-secondary"
                                        style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}>
                                        🗑 Delete
                                      </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {(us.memberDetails || []).map(member => (
                                        <div key={member._id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '20px', fontSize: '12px' }}>
                                          <span style={{ fontWeight: '600' }}>{member.firstName} {member.lastName}</span>
                                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>({member.role})</span>
                                          <button onClick={() => handleRemoveUserFromSet(us._id, member._id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px', padding: '0', lineHeight: 1, fontWeight: '700' }}>×</button>
                                        </div>
                                      ))}
                                      {(!us.memberDetails || us.memberDetails.length === 0) && (
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No members yet.</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Block Rules ── */}
                      {vaultGovSubTab === 'blocks' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px 0' }}>🚫 Add Block Rule</h4>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Deny a user, user set, or collection from all vault access.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>TARGET TYPE</label>
                                <select value={blockForm.targetType} onChange={e => setBlockForm(p => ({ ...p, targetType: e.target.value, targetId: '' }))}
                                  style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }}>
                                  <option value="user">User</option>
                                  <option value="userSet">User Set</option>
                                  <option value="collection">Collection</option>
                                  <option value="record">Record</option>
                                </select>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>TARGET</label>
                                {blockForm.targetType === 'user' ? (
                                  <select value={blockForm.targetId} onChange={e => setBlockForm(p => ({ ...p, targetId: e.target.value }))}
                                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }}>
                                    <option value="">-- Select User --</option>
                                    {usersList.map(u => <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                  </select>
                                ) : blockForm.targetType === 'userSet' ? (
                                  <select value={blockForm.targetId} onChange={e => setBlockForm(p => ({ ...p, targetId: e.target.value }))}
                                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }}>
                                    <option value="">-- Select User Set --</option>
                                    {vaultUserSets.map(us => <option key={us._id} value={us._id}>{us.name}</option>)}
                                  </select>
                                ) : blockForm.targetType === 'collection' ? (
                                  <select value={blockForm.targetId} onChange={e => setBlockForm(p => ({ ...p, targetId: e.target.value }))}
                                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }}>
                                    <option value="">-- Select Collection --</option>
                                    {vaultCollections.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                  </select>
                                ) : (
                                  <input value={blockForm.targetId} onChange={e => setBlockForm(p => ({ ...p, targetId: e.target.value }))} placeholder="Record ObjectId..."
                                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }} />
                                )}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>COLLECTION SCOPE (optional)</label>
                                <select value={blockForm.collectionId} onChange={e => setBlockForm(p => ({ ...p, collectionId: e.target.value }))}
                                  style={{ padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', fontSize: '13px' }}>
                                  <option value="">-- Entire Vault Scope --</option>
                                  {vaultCollections.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                </select>
                              </div>
                            </div>
                            <button onClick={handleAddBlockRule} disabled={!blockForm.targetId.trim()} className="btn btn-primary"
                              style={{ padding: '8px 20px', fontSize: '13px', background: 'linear-gradient(135deg, #EF4444, #DC2626)', border: 'none' }}>
                              🚫 Enforce Block
                            </button>
                          </div>

                          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px 0' }}>Active Block Rules ({vaultBlockRules.length})</h4>
                            {vaultBlockRules.length === 0 ? (
                              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No block rules. Vault is fully open to authorized users.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {vaultBlockRules.map(rule => (
                                  <div key={rule._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                      <span style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '4px', fontWeight: '700', textTransform: 'uppercase', marginRight: '8px' }}>{rule.targetType}</span>
                                      <code style={{ fontSize: '12px' }}>{rule.targetId}</code>
                                      {rule.collectionId && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>→ <code>{rule.collectionId?.toString()?.slice(-8)}</code></span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        by {rule.blockedBy?.firstName} {rule.blockedBy?.lastName} · {new Date(rule.createdAt).toLocaleDateString()}
                                      </span>
                                      <button onClick={() => handleRemoveBlockRule(rule)} className="btn btn-secondary"
                                        style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--success)' }}>
                                        🔓 Unblock
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Vault Audit ── */}
                      {vaultGovSubTab === 'audit' && (
                        <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>📜 Vault Audit Logs</h4>
                            <button onClick={fetchVaultAuditLogs} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}>🔄 Refresh</button>
                          </div>
                          {vaultAuditLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading audit logs...</div>
                          ) : vaultAuditLogs.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No vault audit events recorded yet.</p>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '10px' }}>Timestamp</th>
                                    <th style={{ padding: '10px' }}>Action</th>
                                    <th style={{ padding: '10px' }}>User</th>
                                    <th style={{ padding: '10px' }}>Vault / Collection</th>
                                    <th style={{ padding: '10px' }}>Result</th>
                                    <th style={{ padding: '10px' }}>IP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vaultAuditLogs.map(log => (
                                    <tr key={log._id} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleString()}</td>
                                      <td style={{ padding: '10px' }}>
                                        <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '4px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary-start)' }}>
                                          {log.action}
                                        </span>
                                      </td>
                                      <td style={{ padding: '10px', fontWeight: '600' }}>{log.userName || log.userEmail || '—'}</td>
                                      <td style={{ padding: '10px', fontSize: '11px' }}>
                                        {log.vaultId && <div><span style={{ color: 'var(--text-muted)' }}>V:</span> <code>{log.vaultId?.slice(-10)}</code></div>}
                                        {log.collectionId && <div><span style={{ color: 'var(--text-muted)' }}>C:</span> <code>{log.collectionId?.slice(-10)}</code></div>}
                                      </td>
                                      <td style={{ padding: '10px' }}>
                                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontWeight: '700',
                                          background: log.result === 'success' ? 'rgba(16,185,129,0.08)' : log.result === 'denied' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                                          color: log.result === 'success' ? 'var(--success)' : log.result === 'denied' ? 'var(--danger)' : 'var(--warning)',
                                          border: `1px solid ${log.result === 'success' ? 'rgba(16,185,129,0.2)' : log.result === 'denied' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                                          {log.result || 'success'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>{log.ipAddress || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                    </>
                  )}
                </div>
              )}

              {/* 10. Developer API Keys & Applications Panel */}
              {portalMode === 'admin' && admin && adminTab === 'api-keys' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
                  
                  {/* Generated API Secret modal warning */}
                  {generatedSecretModal && (
                    <div style={{
                      padding: '24px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '2px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '20px',
                      color: 'white',
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ color: '#EF4444', fontWeight: '800', fontSize: '18px', margin: '0 0 8px 0' }}>
                            ⚠️ CRITICAL: Save Your API Secret Key Now!
                          </h4>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 16px 0' }}>
                            For security, this client secret is hashed and will **NEVER** be displayed again. If you lose it, you must rotate the key.
                          </p>
                        </div>
                        <button
                          onClick={() => setGeneratedSecretModal(null)}
                          style={{ background: 'transparent', border: 'none', color: '#ffb3b3', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                        >
                          Dismiss
                        </button>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>API Key ID</span>
                          <code style={{ fontSize: '13px', color: 'var(--primary-start)' }}>{generatedSecretModal.apiKey}</code>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: '700', textTransform: 'uppercase' }}>API Secret (Signed Token)</span>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                            <code style={{ fontSize: '14px', color: '#F59E0B', wordBreak: 'break-all', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', flex: 1 }}>{generatedSecretModal.apiSecret}</code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(generatedSecretModal.apiSecret);
                                addToast('Copied client secret key!', 'success');
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '8px 12px', fontSize: '12px' }}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}



                  <div className="masc-grid-2col-split-reverse">
                    
                    {/* Left: Applications Forms */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="glass-panel" style={{ padding: '24px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 16px 0' }}>🆕 Register New Application</h4>
                        <form onSubmit={handleCreateApplication} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>APPLICATION NAME</label>
                            <input
                              type="text"
                              value={newAppName}
                              onChange={e => setNewAppName(e.target.value)}
                              placeholder="Acme Customer Portal"
                              style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px', marginTop: '4px' }}
                              required
                            />
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>Register App</button>
                        </form>
                      </div>

                      <div className="glass-panel" style={{ padding: '24px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 16px 0' }}>🔑 Generate API Key Pair</h4>
                        <form onSubmit={handleGenerateApiKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div>
                            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>SELECT APPLICATION</label>
                            <select
                              value={keyGenAppId}
                              onChange={e => setKeyGenAppId(e.target.value)}
                              style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px', marginTop: '4px' }}
                              required
                            >
                              <option value="">-- Choose Application --</option>
                              {applications.map(app => (
                                <option key={app._id} value={app._id}>{app.name}</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ padding: '10px' }}>Generate Keys</button>
                        </form>
                      </div>
                    </div>

                    {/* Right: Lists */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="glass-panel" style={{ padding: '24px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 16px 0' }}>📱 Registered Apps ({applications.length})</h4>
                        {applications.length === 0 ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No registered applications.</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {applications.map(app => (
                              <div key={app._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                                <div>
                                  <strong style={{ fontSize: '14px' }}>{app.name}</strong>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: <code>{app._id}</code></div>
                                </div>
                                <button
                                  onClick={() => handleDeleteApplication(app._id, app.name)}
                                  className="btn"
                                  style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px' }}
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="glass-panel" style={{ padding: '24px' }}>
                        <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 16px 0' }}>🔑 Active Credentials ({apiKeys.length})</h4>
                        {apiKeys.length === 0 ? (
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active API Keys.</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {apiKeys.map(key => (
                              <div key={key._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                  <div>
                                    <strong style={{ fontSize: '13px', color: 'var(--primary-start)' }}>{key.applicationId?.name || 'Unknown Application'}</strong>
                                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '2px' }}>
                                      Key: <code>{key.apiKey.substring(0, 15)}...</code>
                                    </div>
                                  </div>
                                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.08)', color: 'var(--success)', fontWeight: '700' }}>
                                    {key.status}
                                  </span>
                                </div>
                                <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.01)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                  <span style={{ fontWeight: '700', color: 'var(--text-muted)' }}>API Permissions:</span>
                                  {['create', 'read', 'update', 'delete'].map(action => {
                                    const keyPerms = key.permissions || ['create', 'read', 'update', 'delete'];
                                    const isChecked = keyPerms.includes(action);
                                    return (
                                      <label key={action} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', color: isChecked ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={async (e) => {
                                            const active = e.target.checked;
                                            let nextPerms = [...keyPerms];
                                            if (active && !nextPerms.includes(action)) {
                                              nextPerms.push(action);
                                            } else if (!active && nextPerms.includes(action)) {
                                              nextPerms = nextPerms.filter(x => x !== action);
                                            }
                                            try {
                                              const res = await fetch(`${API_BASE}/admin/api-keys/${key._id}`, {
                                                method: 'PUT',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                  Authorization: `Bearer ${token}`
                                                },
                                                body: JSON.stringify({ permissions: nextPerms })
                                              });
                                              if (!res.ok) {
                                                const d = await res.json();
                                                throw new Error(d.error || 'Failed to update key permissions');
                                              }
                                              addToast('API Key permissions updated.', 'success');
                                              fetchApiKeys();
                                            } catch (err) {
                                              addToast(err.message, 'error');
                                            }
                                          }}
                                        />
                                        <span>{action}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {key.rotatedAt ? `Rotated: ${new Date(key.rotatedAt).toLocaleDateString()}` : `Created: ${new Date(key.createdAt).toLocaleDateString()}`}
                                  </span>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => handleRotateApiKey(key._id)}
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 8px', fontSize: '11px' }}
                                    >
                                      🔄 Rotate
                                    </button>
                                    <button
                                      onClick={() => handleDeleteApiKey(key._id)}
                                      className="btn"
                                      style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.15)' }}
                                    >
                                      Revoke
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {/* 11. Route-Level Rules Management Panel */}
              {portalMode === 'admin' && admin && adminTab === 'route-rules' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
                  


                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                    
                    {/* Left: Create Rule Form */}
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 4px 0' }}>🛣️ Configure Route Authorization Rule</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                        Create a rule to allow or block access for targeted users, user sets, or roles on a specific path.
                      </p>

                      <form onSubmit={handleSaveRouteRule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>ROUTE ENDPOINT PATH</label>
                          <input
                            type="text"
                            value={routeRuleForm.path}
                            onChange={e => setRouteRuleForm(prev => ({ ...prev, path: e.target.value }))}
                            placeholder="e.g. /dashboard or /api/v1/employees"
                            style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px', marginTop: '4px' }}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>RULE ACTION / MODE</label>
                          <select
                            value={routeRuleForm.action}
                            onChange={e => setRouteRuleForm(prev => ({ ...prev, action: e.target.value }))}
                            style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dark)', borderRadius: '4px', marginTop: '4px' }}
                            required
                          >
                            <option value="block">🚫 Block Access (Deny Matching Targets)</option>
                            <option value="allow">✅ Allow Access (Only Allow Matching Targets)</option>
                          </select>
                        </div>

                        {/* TARGET SELECTION GRID */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-start)' }}>🎯 TARGETED ROLES, GROUPS & MEMBERS</span>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                            <div>
                              <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>ROLES</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                {['manager', 'user'].map(role => (
                                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                    <input
                                      type="checkbox"
                                      checked={routeRuleForm.roles.includes(role)}
                                      onChange={e => {
                                        const checked = e.target.checked;
                                        setRouteRuleForm(prev => ({
                                          ...prev,
                                          roles: checked ? [...prev.roles, role] : prev.roles.filter(r => r !== role)
                                        }))
                                      }}
                                    />
                                    <span style={{ textTransform: 'capitalize' }}>{role}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>USER SETS (GROUPS)</label>
                              <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border)', padding: '6px', borderRadius: '4px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {vaultUserSets.map(us => (
                                  <label key={us._id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                    <input
                                      type="checkbox"
                                      checked={routeRuleForm.userSets.includes(us._id)}
                                      onChange={e => {
                                        const checked = e.target.checked;
                                        setRouteRuleForm(prev => ({
                                          ...prev,
                                          userSets: checked ? [...prev.userSets, us._id] : prev.userSets.filter(id => id !== us._id)
                                        }))
                                      }}
                                    />
                                    <span>{us.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>INDIVIDUAL MEMBERS</label>
                            <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border)', padding: '6px', borderRadius: '4px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {usersList.filter(u => u.role !== 'admin').map(u => (
                                <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                  <input
                                    type="checkbox"
                                    checked={routeRuleForm.users.includes(u._id)}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setRouteRuleForm(prev => ({
                                        ...prev,
                                        users: checked ? [...prev.users, u._id] : prev.users.filter(id => id !== u._id)
                                      }))
                                    }}
                                  />
                                  <span>{u.firstName} {u.lastName} ({u.email})</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ padding: '12px', marginTop: '10px' }}>
                          💾 Save Route Rule
                        </button>
                      </form>
                    </div>

                    {/* Right: Active Route Rules list */}
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: '750', margin: '0 0 16px 0' }}>Defined Route Rules ({routeRules.length})</h4>
                      {routeRules.length === 0 ? (
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No custom route authorization rules defined.</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {routeRules.map(rule => (
                            <div key={rule._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.01)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                <div>
                                  <strong style={{ fontSize: '15px', color: 'var(--primary-start)' }}>{rule.path}</strong>
                                  <span style={{
                                    marginLeft: '10px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: rule.action === 'allow' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: rule.action === 'allow' ? '#10B981' : '#EF4444',
                                    textTransform: 'uppercase'
                                  }}>
                                    {rule.action}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteRouteRule(rule._id)}
                                  className="btn"
                                  style={{ padding: '2px 8px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.15)' }}
                                >
                                  Remove
                                </button>
                              </div>

                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                <div style={{ fontWeight: '700', marginBottom: '4px' }}>Targeted Scope:</div>
                                <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                                  {rule.roles?.map(r => <li key={r}>Role: <span style={{ textTransform: 'capitalize' }}>{r}</span></li>)}
                                  {rule.userSets?.map(us => <li key={us._id || us}>Group: {us.name || us}</li>)}
                                  {rule.users?.map(u => <li key={u._id || u}>User: {u.firstName ? `${u.firstName} ${u.lastName}` : u}</li>)}
                                  {(!rule.roles?.length && !rule.userSets?.length && !rule.users?.length) && <li>None (Applies to all)</li>}
                                </ul>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Member portal views have been decoupled into the external software demo. */}

            </main>
          </div>
        )}



        {/* User Logs History Modal */}
        {userLogsModalOpen && selectedUserForLogs && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="glass-panel" style={{
              background: 'rgba(17, 12, 28, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              width: '100%',
              maxWidth: '800px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
              textAlign: 'left',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h4 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'white' }}>
                    📜 Security Log History
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                    Member: <strong>{selectedUserForLogs.firstName} {selectedUserForLogs.lastName}</strong> ({selectedUserForLogs.email})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUserLogsModalOpen(false);
                    setSelectedUserForLogs(null);
                    setSelectedUserLogs([]);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '20px',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedUserLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    ⏳ Fetching audit trail logs or no events logged yet for this member...
                  </div>
                ) : (
                  selectedUserLogs.map((log) => {
                    const isAlert = log.action === 'SESSION_HIJACK_DETECTED' || log.action === 'ACCESS_DENIED';
                    const isLogin = log.action === 'USER_LOGIN';
                    
                    return (
                      <div
                        key={log._id}
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          background: isAlert ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                          border: isAlert ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: isAlert ? 'var(--danger)' : isLogin ? 'var(--success)' : 'var(--primary-start)',
                            color: 'white',
                            textTransform: 'uppercase'
                          }}>
                            {log.action}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                          <div>
                            <strong>IP Address:</strong> {log.ipAddress || 'Unknown'}
                          </div>
                          <div>
                            <strong>Device:</strong> <span title={log.userAgent}>{getCleanDevice(log)}</span>
                          </div>
                        </div>

                        {log.details && (
                          <div style={{
                            marginTop: '10px',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(0,0,0,0.2)',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: '#a78bfa',
                            whiteSpace: 'pre-wrap'
                          }}>
                            <strong>Metadata:</strong> {JSON.stringify(log.details, null, 2)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setUserLogsModalOpen(false);
                    setSelectedUserForLogs(null);
                    setSelectedUserLogs([]);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '10px 24px', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  Close logs
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Flush Audit Logs Modal */}
        {flushModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="glass-panel" style={{
              background: 'rgba(17, 12, 28, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
              textAlign: 'left',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h4 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'white' }}>
                    🗑️ Flush Security Audit Logs
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '4px 0 0 0' }}>
                    Flushing logs is a destructive administrative operation.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFlushModalOpen(false);
                    setFlushPassword('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '20px',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleFlushLogs} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                    Select Flush Target
                  </label>
                  <select
                    value={flushTarget}
                    onChange={(e) => {
                      setFlushTarget(e.target.value);
                      if (e.target.value !== 'user') {
                        setFlushUserId('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: 'white',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="low-risk">Flush logs for Low-Risk users</option>
                    <option value="everyone">Flush logs for Everyone</option>
                    <option value="user">Flush logs for a Particular User</option>
                  </select>
                </div>

                {flushTarget === 'user' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                      Select Target Member
                    </label>
                    <select
                      value={flushUserId}
                      onChange={(e) => setFlushUserId(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: 'white',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    >
                      <option value="">-- Choose User --</option>
                      {usersList.map(u => (
                        <option key={u._id} value={u._id}>
                          {u.firstName} {u.lastName} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                    Verify Administrator Password
                  </label>
                  <input
                    type="password"
                    value={flushPassword}
                    onChange={(e) => setFlushPassword(e.target.value)}
                    placeholder="Enter admin password to confirm"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0, 0, 0, 0.3)',
                      color: 'white',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setFlushModalOpen(false);
                      setFlushPassword('');
                    }}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '10px', fontSize: '13px', borderColor: 'rgba(255,255,255,0.15)', color: 'white' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={flushLoading}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', background: 'var(--danger)', border: 'none' }}
                  >
                    {flushLoading ? 'Flushing...' : '⚠️ Confirm & Flush'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AI Security Risk Report Modal */}
        {selectedSessionForAiReport && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2500,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="glass-panel" style={{
              background: 'rgba(15, 12, 30, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              width: '90%',
              maxWidth: '560px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)',
              textAlign: 'left',
              color: '#ffffff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h4 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'white' }}>
                    🧠 AI Real-Time Risk Analysis
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
                    Session ID: <strong>{selectedSessionForAiReport._id}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSessionForAiReport(null)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '20px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Score Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{
                    width: '72px', height: '72px', borderRadius: '50%',
                    background: (selectedSessionForAiReport.riskScore || 10) >= 75 ? 'rgba(239, 68, 68, 0.1)' : (selectedSessionForAiReport.riskScore || 10) >= 35 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    border: (selectedSessionForAiReport.riskScore || 10) >= 75 ? '3px solid var(--danger)' : (selectedSessionForAiReport.riskScore || 10) >= 35 ? '3px solid var(--warning)' : '3px solid var(--success)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '800',
                    color: (selectedSessionForAiReport.riskScore || 10) >= 75 ? 'var(--danger)' : (selectedSessionForAiReport.riskScore || 10) >= 35 ? 'var(--warning)' : 'var(--success)'
                  }}>
                    {selectedSessionForAiReport.riskScore || 10}%
                  </div>
                  <div>
                    <h5 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
                      Threat Index Classification
                    </h5>
                    <p style={{
                      margin: '4px 0 0 0', fontSize: '13px', fontWeight: '600',
                      color: (selectedSessionForAiReport.riskScore || 10) >= 75 ? 'var(--danger)' : (selectedSessionForAiReport.riskScore || 10) >= 35 ? 'var(--warning)' : 'var(--success)'
                    }}>
                      {(selectedSessionForAiReport.riskScore || 10) >= 75 ? '🔴 HIGH THREAT ALERT' : (selectedSessionForAiReport.riskScore || 10) >= 35 ? '🟡 SUSPICIOUS TELEMETRY DETECTED' : '🟢 SAFE & TRUSTED'}
                    </p>
                  </div>
                </div>

                {/* Telemetry data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>User Email:</span>
                    <span style={{ fontWeight: '600' }}>{selectedSessionForAiReport.userId?.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Device / Platform:</span>
                    <span style={{ fontWeight: '600' }}>{selectedSessionForAiReport.browser} ({selectedSessionForAiReport.os})</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>IP Endpoint:</span>
                    <span style={{ fontWeight: '600' }}>{selectedSessionForAiReport.ipAddress === '::1' || selectedSessionForAiReport.ipAddress === '127.0.0.1' || selectedSessionForAiReport.ipAddress?.includes('127.0.0.1') ? '127.0.0.1 (Localhost)' : selectedSessionForAiReport.ipAddress}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Session Creation:</span>
                    <span style={{ fontWeight: '600' }}>{new Date(selectedSessionForAiReport.loginTime).toLocaleString()}</span>
                  </div>
                </div>

                {/* Recommendations */}
                <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--primary-start)' }}>
                  <strong style={{ display: 'block', fontSize: '13px', color: 'white', marginBottom: '6px' }}>
                    💡 AI Engine Recommendation:
                  </strong>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    {(selectedSessionForAiReport.riskScore || 10) >= 75 ? (
                      'CRITICAL: Immediate action required. Suspend this user or force terminate the session to prevent potential unauthorized access or data exfiltration.'
                    ) : (selectedSessionForAiReport.riskScore || 10) >= 35 ? (
                      'MONITOR: Telemetry data points display minor variances. Verify physical device location or request MFA prompt re-validation.'
                    ) : (
                      'SECURE: System parameters and network routing are safe. No actions required at this time.'
                    )}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedSessionForAiReport(null)}
                  className="btn btn-secondary"
                  style={{ padding: '10px 24px', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  Close report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Premium Confirmation Dialog Modal */}
        {confirmDialog.isOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            animation: 'fadeIn 0.15s ease-out'
          }}>
            <div className="glass-panel" style={{
              background: 'rgba(20, 16, 32, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              width: '90%',
              maxWidth: '460px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              textAlign: 'left',
              color: '#ffffff'
            }}>
              <h4 style={{ fontSize: '18px', fontWeight: '800', margin: '0 0 10px 0', color: confirmDialog.isDanger ? 'var(--danger)' : 'white' }}>
                {confirmDialog.title}
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.5', margin: '0 0 24px 0' }}>
                {confirmDialog.message}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="btn btn-secondary"
                  style={{ padding: '10px 20px', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {confirmDialog.cancelText}
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className="btn"
                  style={{
                    padding: '10px 20px',
                    background: confirmDialog.isDanger ? 'var(--danger)' : 'var(--primary-start)',
                    color: 'white',
                    fontWeight: '700',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  {confirmDialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer>
          <p>© 2026 MASC Security System. Powered by JavaScript, Express, and React.</p>
        </footer>
      </div>
    </MascThemeProvider>
  )
}

export default App