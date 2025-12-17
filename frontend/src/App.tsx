import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQueues } from './hooks/useQueues';
import { useQueueMetrics } from './hooks/useQueueMetrics';
import { Activity, Database, Clock, TrendingUp, LogOut, RefreshCw, ArrowUpDown, Filter, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { config } from './config';
import './styles/dashboard.css';

type SortField = 'queue_name' | 'grp' | 'message_count' | 'polled_at';
type SortDirection = 'asc' | 'desc';

interface SystemInfo {
  dbName: string;
  environment: string;
  color: string;
  user: string;
}

interface QueueStatus {
  status: string;
  className: string;
}

export default function App() {
  const [token, setToken] = useState<string|null>(null);
  const [username, setUsername] = useState<string>('');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [sortField, setSortField] = useState<SortField>('queue_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [databases, setDatabases] = useState<Array<{id: string; user: string; connectString: string}>>([]);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [filterSystemUser, setFilterSystemUser] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatuses, setFilterStatuses] = useState<string[]>(['Idle', 'Active', 'Paused', 'Blocked']); // All selected by default
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedQueue, setExpandedQueue] = useState<string | null>(null);
  const [queueStatuses, setQueueStatuses] = useState<Record<string, QueueStatus>>({});
  const [emailStatus, setEmailStatus] = useState<{enabled: boolean; configEnabled: boolean; hasOverride: boolean; environment: string} | null>(null);

  const { data: queues, loading: queuesLoading, hasLoaded: queuesHasLoaded, refetch: refetchQueues } = useQueues(token, selectedDbId);
  const { data: queueMetrics, loading: metricsLoading } = useQueueMetrics(token, expandedQueue, selectedDbId);

  // Fetch system info when token or selected database changes
  useEffect(() => {
    if (!token) {
      setSystemInfo(null);
      return;
    }

    const fetchSystemInfo = async () => {
      try {
        const url = selectedDbId
          ? `${config.endpoints.system.info}?dbId=${encodeURIComponent(selectedDbId)}`
          : config.endpoints.system.info;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setSystemInfo(data);
        }
      } catch (err) {
        console.error('Failed to fetch system info', err);
      }
    };

    fetchSystemInfo();
  }, [token, selectedDbId]);

  // Fetch email status when token or selected database changes
  useEffect(() => {
    if (!token || !selectedDbId) {
      setEmailStatus(null);
      return;
    };

    const fetchEmailStatus = async () => {
      try {
        const url = `${config.endpoints.admin.emailStatus}?dbId=${encodeURIComponent(selectedDbId)}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setEmailStatus(data);
        }
      } catch (err) {
        console.error('Failed to fetch email status', err);
      }
    };

    fetchEmailStatus();
  }, [token, selectedDbId]);

  // Fetch system users and databases when token is available
  useEffect(() => {
    if (!token) {
      return;
    };

    const fetchSystemUsers = async () => {
      try {
        const response = await fetch(config.endpoints.system.systemUsers, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setSystemUsers(data.systemUsers || []);
        }
      } catch (err) {
        console.error('Failed to fetch system users', err);
      }
    };

    const fetchDatabases = async () => {
      try {
        const response = await fetch(config.endpoints.system.databases, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setDatabases(data.databases || []);
          // Set default to first database
          if (data.databases && data.databases.length > 0) {
            setSelectedDbId(data.databases[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch databases', err);
      }
    };

    fetchSystemUsers();
    fetchDatabases();
  }, [token]);

  // Toggle email notifications
  const toggleEmail = async () => {
    if (!token || !emailStatus || !selectedDbId) return;

    try {
      const response = await fetch(config.endpoints.admin.emailToggle, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          enabled: !emailStatus.enabled,
          dbId: selectedDbId 
        })
      });

      if (response.ok) {
        const data = await response.json();
        setEmailStatus(data.status);
      } else {
        alert('Failed to toggle email notifications');
      }
    } catch (err) {
      console.error('Failed to toggle email', err);
      alert('Error toggling email notifications');
    }
  };

  // Calculate queue statuses based on current queue data (message_count and last_dequeued from polling)
  useEffect(() => {
    if (!queues || queues.length === 0) {
      setQueueStatuses({});
      return;
    }

    const statuses: Record<string, QueueStatus> = {};

    for (const queue of queues) {
      // Use message_count and last_dequeued from the queue list
      statuses[queue.queue_name] = getQueueStatusInfo(queue.message_count, queue.last_dequeued || null);
    }

    setQueueStatuses(statuses);
  }, [queues]); // Update whenever queues data changes

  function getQueueStatusInfo(readyCount: number, lastProcessedTime: string | null): QueueStatus {
    if (readyCount === 0) {
      return { status: 'Idle', className: 'idle' };
    }

    if (!lastProcessedTime) {
      return { status: 'Blocked', className: 'blocked' };
    }

    const now = new Date().getTime();
    const lastProcessed = new Date(lastProcessedTime).getTime();
    const secondsAgo = (now - lastProcessed) / 1000;

    if (secondsAgo < 60) {
      return { status: 'Active', className: 'active' };
    } else if (secondsAgo < 300) {
      return { status: 'Paused', className: 'pending' };
    } else {
      return { status: 'Blocked', className: 'blocked' };
    }
  }

  function formatLastProcessed(dateStr: string | null) {
    if (!dateStr) return 'Never';

    try {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Invalid date';
    }
  }

  function getReadyMessageColor(readyCount: number, lastProcessedTime: string | null): { backgroundColor: string; color: string } {
    if (readyCount === 0) {
      return { backgroundColor: '#f9fafb', color: '#1f2937' }; // Light grey background with dark text - no special color
    }

    if (!lastProcessedTime) {
      return { backgroundColor: '#ef4444', color: 'white' }; // Red - never processed
    }

    const now = new Date().getTime();
    const lastProcessed = new Date(lastProcessedTime).getTime();
    const secondsAgo = (now - lastProcessed) / 1000;

    if (secondsAgo < 60) {
      return { backgroundColor: '#10b981', color: 'white' }; // Green - processed within 60 seconds
    } else if (secondsAgo < 300) {
      return { backgroundColor: '#f59e0b', color: 'white' }; // Amber - processed within 5 minutes
    } else {
      return { backgroundColor: '#ef4444', color: 'white' }; // Red - processed over 5 minutes ago
    }
  }

  async function login(e: any) {
    e.preventDefault();
    const u = e.target.user.value;
    const p = e.target.pass.value;

    try {
      const resp = await fetch(config.endpoints.auth.login, {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: u, password: p })
      });

      if (!resp.ok) {
        alert('Login failed');
        return;
      }

      const j = await resp.json();
      setToken(j.token);
      setUsername(u);
    } catch (err) {
      console.error('Login error:', err);
      alert('Cannot connect to backend. Make sure it is running on port 4001');
    }
  }

  function logout() {
    setToken(null);
    setUsername('');
    setExpandedQueue(null);
    setSystemInfo(null);
    setQueueStatuses({});
  }

  function handleQueueClick(queueName: string) {
    setExpandedQueue(expandedQueue === queueName ? null : queueName);
  }

  const groups = useMemo(() => {
    const uniqueGroups = new Set(queues.map(q => q.grp));
    return ['all', ...Array.from(uniqueGroups).sort()];
  }, [queues]);

  const filteredAndSortedQueues = useMemo(() => {
    let filtered = queues;

    if (filterSystemUser !== 'all') {
      // Extract owner from queue_name (format: OWNER.QUEUE_NAME)
      filtered = filtered.filter(q => {
        const owner = q.queue_name.split('.')[0];
        return owner === filterSystemUser;
      });
    }

    if (filterGroup !== 'all') {
      filtered = filtered.filter(q => q.grp === filterGroup);
    }

    if (searchTerm && searchTerm.length >= 2) {
      filtered = filtered.filter(q =>
        q.queue_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (filterStatuses.length === 0) {
      // If no statuses are selected, show no queues
      filtered = [];
    } else {
      // Show only queues with selected statuses
      filtered = filtered.filter(q => {
        const status = queueStatuses[q.queue_name]?.status;
        return status && filterStatuses.includes(status);
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (sortField === 'polled_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [queues, sortField, sortDirection, filterSystemUser, filterGroup, searchTerm, filterStatuses, queueStatuses]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  const totalMessages = filteredAndSortedQueues.reduce((sum, q) => sum + (q.message_count || 0), 0);
  const activeQueues = filteredAndSortedQueues.filter(q => (q.message_count || 0) > 0).length;

  // Get environment badge styles
  const getEnvBadgeClass = () => {
    if (!systemInfo) return 'env-badge-gray';
    
    switch (systemInfo.color) {
      case 'green':
        return 'env-badge-green';
      case 'yellow':
        return 'env-badge-yellow';
      case 'red':
        return 'env-badge-red';
      default:
        return 'env-badge-gray';
    }
  };

  return (
    <div className="app">
      {!token ? (
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <Activity size={48} className="login-icon" />
              <h1>AQ Monitor</h1>
              <p>Oracle Advanced Queue Monitoring</p>
            </div>
            <form onSubmit={login} className="login-form">
              <div className="form-group">
                <input name="user" placeholder="Username" required className="form-input" />
              </div>
              <div className="form-group">
                <input name="pass" type="password" placeholder="Password" required className="form-input" />
              </div>
              <button type="submit" className="btn-primary">Login</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="dashboard">
          <header className="dashboard-header">
            <div className="header-left">
              <Activity size={32} />
              <h1>AQ Monitor</h1>
              {databases.length > 0 && (
                <div className="header-db-selector">
                  <Database size={16} />
                  <select
                    value={selectedDbId}
                    onChange={(e) => setSelectedDbId(e.target.value)}
                    className="db-select"
                  >
                    {databases.map(db => (
                      <option key={db.id} value={db.id}>
                        {db.id.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="header-right">
              {emailStatus ? (
                <div className="email-toggle-container">
                  <span className={`email-status-label ${emailStatus.enabled ? 'enabled' : 'disabled'}`}>
                    Email Alerts: {emailStatus.enabled ? 'ON' : 'OFF'}
                  </span>
                  <button 
                    onClick={toggleEmail} 
                    className={`btn-toggle ${emailStatus.enabled ? 'enabled' : 'disabled'}`}
                    title={`Click to turn ${emailStatus.enabled ? 'OFF' : 'ON'}`}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>
              ) : (
                <div className="email-toggle-container">
                  <span className="email-status-label disabled">Email: Loading...</span>
                </div>
              )}
              <span className="username">Welcome, {username}</span>
              <button onClick={refetchQueues} className="btn-icon" title="Refresh">
                <RefreshCw size={20} />
              </button>
              <button onClick={logout} className="btn-icon" title="Logout">
                <LogOut size={20} />
              </button>
            </div>
          </header>

          {(() => {
            // Check if data is stale (no updates in last 30 seconds)
            const isStale = queues.length > 0 && queues.every(q => {
              const polledAt = new Date(q.polled_at);
              const ageMs = Date.now() - polledAt.getTime();
              return ageMs > 30000; // 30 seconds
            });
            
            const showWarning = (queues.length === 0 || isStale) && selectedDbId && queuesHasLoaded && !queuesLoading;
            
            console.log('Database availability check:', { 
              queuesLength: queues.length, 
              selectedDbId, 
              queuesHasLoaded, 
              queuesLoading,
              isStale,
              oldestPoll: queues.length > 0 ? queues[0]?.polled_at : null,
              showWarning 
            });
            
            return showWarning ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                background: '#fff3cd', 
                border: '1px solid #ffc107',
                borderRadius: '8px',
                margin: '32px'
              }}>
                <h3 style={{ color: '#856404', marginBottom: '10px' }}>Database Unavailable</h3>
                <p style={{ color: '#856404', margin: 0 }}>
                  Unable to connect to database <strong>{selectedDbId.toUpperCase()}</strong>. 
                  The database may be locked, unavailable, or experiencing connectivity issues. 
                  The system will automatically retry every 10 seconds.
                  {isStale && queues.length > 0 && (
                    <><br /><br /><em style={{ fontSize: '14px' }}>Showing stale data from last successful connection.</em></>
                  )}
                </p>
              </div>
            ) : null;
          })()}

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <Database size={24} />
              </div>
              <div className="stat-content">
                <h3>Total Queues</h3>
                <p className="stat-value">{filteredAndSortedQueues.length}</p>
                <span className="stat-subtitle">of {queues.length} total</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <Activity size={24} />
              </div>
              <div className="stat-content">
                <h3>Active Queues</h3>
                <p className="stat-value">{activeQueues}</p>
                <span className="stat-subtitle">with messages</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">
                <TrendingUp size={24} />
              </div>
              <div className="stat-content">
                <h3>Total Pending Messages</h3>
                <p className="stat-value">{totalMessages}</p>
                <span className="stat-subtitle">in filtered queues</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon purple">
                <Clock size={24} />
              </div>
              <div className="stat-content">
                <h3>Last Updated</h3>
                <p className="stat-value">{new Date().toLocaleTimeString()}</p>
                <span className="stat-subtitle">auto-refresh every 10s</span>
              </div>
            </div>
          </div>

          {queues.length > 0 && (
            <div className="card">
            <div className="card-header">
              <div className="card-header-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2>Queues</h2>
                  {selectedDbId && (
                    <span style={{ fontSize: '18px', color: '#667eea', fontWeight: '700' }}>
                      {selectedDbId.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="filter-controls">
                  <div className="filter-group">
                    <Filter size={16} />
                    <button
                      onClick={() => {
                        setFilterSystemUser('all');
                        setFilterGroup('all');
                        setSearchTerm('');
                        setFilterStatuses(['Idle', 'Active', 'Paused', 'Blocked']);
                      }}
                      className="btn-reset-filters"
                      title="Reset all filters"
                    >
                      <RotateCcw size={16} />
                    </button>
                    <select
                      value={filterSystemUser}
                      onChange={(e) => setFilterSystemUser(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Schemas</option>
                      {systemUsers.map(user => (
                        <option key={user} value={user}>
                          {user}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="filter-group">
                    <select
                      value={filterGroup}
                      onChange={(e) => setFilterGroup(e.target.value)}
                      className="filter-select"
                    >
                      {groups.map(g => (
                        <option key={g} value={g}>
                          {g === 'all' ? 'All Groups' : g.toUpperCase().replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Search queues..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  
                  <div className="status-filter-group">
                    <span className="filter-label">Status:</span>
                    {['Idle', 'Active', 'Paused', 'Blocked'].map(status => (
                      <label key={status} className={`status-checkbox ${status.toLowerCase()}`}>
                        <input
                          type="checkbox"
                          checked={filterStatuses.includes(status)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterStatuses([...filterStatuses, status]);
                            } else {
                              setFilterStatuses(filterStatuses.filter(s => s !== status));
                            }
                          }}
                        />
                        <span>{status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="table-container">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th style={{width: '50px'}}></th>
                    <th onClick={() => handleSort('queue_name')} className="sortable">
                      <div className="th-content">
                        Queue Name
                        <ArrowUpDown size={14} className={sortField === 'queue_name' ? 'active' : ''} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('grp')} className="sortable">
                      <div className="th-content">
                        Group
                        <ArrowUpDown size={14} className={sortField === 'grp' ? 'active' : ''} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('message_count')} className="sortable">
                      <div className="th-content">
                        Messages
                        <ArrowUpDown size={14} className={sortField === 'message_count' ? 'active' : ''} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('polled_at')} className="sortable">
                      <div className="th-content">
                        Last Polled
                        <ArrowUpDown size={14} className={sortField === 'polled_at' ? 'active' : ''} />
                      </div>
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedQueues.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="no-data">No queues found</td>
                    </tr>
                  ) : (
                    filteredAndSortedQueues.map((q, i) => {
                      const statusInfo = queueStatuses[q.queue_name] || { status: 'Idle', className: 'idle' };
                      
                      return (
                        <React.Fragment key={i}>
                          <tr onClick={() => handleQueueClick(q.queue_name)} className="clickable-row">
                            <td className="expand-cell">
                              {expandedQueue === q.queue_name ? (
                                <ChevronUp size={16} className="expand-icon" />
                              ) : (
                                <ChevronDown size={16} className="expand-icon" />
                              )}
                            </td>
                            <td className="queue-name">{q.queue_name}</td>
                            <td><span className="badge">{q.grp.toUpperCase().replace(/_/g, ' ')}</span></td>
                            <td className="message-count">{q.message_count || 0}</td>
                            <td>{new Date(q.polled_at).toLocaleString()}</td>
                            <td>
                              <span className={`status-badge ${statusInfo.className}`}>
                                {statusInfo.status}
                              </span>
                            </td>
                          </tr>
                          {expandedQueue === q.queue_name && (
                            <tr className="analytics-row">
                              <td colSpan={6}>
                                {metricsLoading ? (
                                  <div className="analytics-loading">
                                    <div className="loading-spinner-small"></div>
                                    <span>Loading analytics...</span>
                                  </div>
                                ) : queueMetrics ? (
                                  <div className="analytics-panel">
                                    <div className="analytics-header">
                                      <h3 className="analytics-title">{q.queue_name}</h3>
                                      <span className="analytics-subtitle">Queue Analytics (Last 5 Days)</span>
                                    </div>

                                    <div className="analytics-grid" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                                      <div className="analytics-item" style={{...getReadyMessageColor(queueMetrics.readyCount || 0, queueMetrics.lastProcessedTime), minWidth: 160}}>
                                        <div className="analytics-label">Messages Ready Now</div>
                                        <div className="analytics-value">{queueMetrics.readyCount?.toLocaleString() || 0}</div>
                                        <div className="analytics-subtitle" style={{ color: 'rgba(255,255,255,0.9)' }}>Current READY state</div>
                                      </div>
                                      <div className="analytics-item" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', minWidth: 180, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <div className="analytics-label" style={{ marginBottom: 4 }}>Per-Day (5d)</div>
                                        <ResponsiveContainer width={120} height={60}>
                                          <BarChart data={queueMetrics.dailyStats?.slice(-5) || []} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                            <XAxis dataKey="date" hide tick={false} />
                                            <YAxis hide domain={[0, 'dataMax']} />
                                            <Tooltip formatter={(value) => value.toLocaleString()} labelFormatter={d => `Date: ${d}`} />
                                            <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                                          </BarChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="analytics-item" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', minWidth: 160 }}>
                                        <div className="analytics-label">Total Enqueued (5 Days)</div>
                                        <div className="analytics-value">{queueMetrics.totalMessages.toLocaleString()}</div>
                                      </div>
                                      <div className="analytics-item" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', minWidth: 160 }}>
                                        <div className="analytics-label">Avg Enqueued/Day</div>
                                        <div className="analytics-value">
                                          {queueMetrics.avgMessagesPerDay.toLocaleString()}
                                        </div>
                                      </div>
                                      <div className="analytics-item" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', minWidth: 160 }}>
                                        <div className="analytics-label">Max Dequeued/Hour</div>
                                        <div className="analytics-value">{queueMetrics.maxPerHour.toLocaleString()}</div>
                                        <div className="analytics-subtitle">{queueMetrics.peakHourTime}</div>
                                      </div>
                                      <div className="analytics-item" style={{ backgroundColor: '#fef3c7', borderColor: '#fde68a', minWidth: 160 }}>
                                        <div className="analytics-label">Retry Statistics</div>
                                        <div className="analytics-value">{queueMetrics.totalRetried?.toLocaleString() || 0}</div>
                                        <div className="analytics-subtitle">Total Retried | Max: {queueMetrics.maxRetryCount || 0}</div>
                                      </div>
                                      {queueMetrics.totalMessages > 0 && (
                                        <div className="analytics-item highlight">
                                          <div className="analytics-label">Last Dequeued</div>
                                          <div className="analytics-value-small">
                                            {formatLastProcessed(queueMetrics.lastProcessedTime)}
                                          </div>
                                          <div className="analytics-subtitle" style={{ marginTop: '8px', fontSize: '0.75rem' }}>
                                            Last polled: {formatLastProcessed(q.polled_at)}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <div className="daily-breakdown">
                                      <h4>Daily Enqueued Messages</h4>
                                      <div className="daily-list">
                                        {queueMetrics.dailyStats.length > 0 ? (
                                          [...queueMetrics.dailyStats]
                                            .sort((a, b) => b.date.localeCompare(a.date))
                                            .map((day: any, idx: number) => (
                                              <div key={idx} className="daily-item">
                                                <span className="daily-date">{day.date}</span>
                                                <span className="daily-count">{day.count.toLocaleString()} messages</span>
                                              </div>
                                            ))
                                        ) : (
                                          <div className="daily-item">
                                            <span className="daily-date">No daily data available</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="analytics-no-data">
                                    No analytics data available for this queue
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}