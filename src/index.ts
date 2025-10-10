import { Hono } from 'hono';
import { SignJWT } from 'jose'; // CORRECTED IMPORT

// Define the structure of our environment variables for type safety.
// This tells TypeScript what `env` will contain.
export type Bindings = {
  PLUCT_KV: KVNamespace;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
};

// Initialize our application router.
const app = new Hono<{ Bindings: Bindings }>();

// Serve the main HTML page
app.get('/', async (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pluct Business Engine Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            color: #fff;
            padding: 1.5rem;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        header h1 {
            font-size: 2rem;
            font-weight: 300;
            letter-spacing: 1px;
        }

        main {
            padding: 2rem;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: calc(100vh - 120px);
        }

        #login-section {
            max-width: 450px;
            width: 100%;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        #login-section h2 {
            text-align: center;
            margin-bottom: 2rem;
            color: #333;
            font-weight: 300;
            font-size: 1.8rem;
        }

        #login-section form {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        #login-section label {
            font-weight: 500;
            color: #555;
            margin-bottom: 0.5rem;
            display: block;
        }

        #login-section input {
            padding: 1rem;
            border: 2px solid #e1e5e9;
            border-radius: 10px;
            font-size: 1rem;
            transition: all 0.3s ease;
            background: rgba(255, 255, 255, 0.8);
        }

        #login-section input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            transform: translateY(-2px);
        }

        #dashboard {
            display: none;
            max-width: 1400px;
            width: 100%;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #e1e5e9;
        }

        .dashboard-header h2 {
            color: #333;
            font-weight: 300;
            font-size: 1.8rem;
            margin: 0;
        }

        .logout-btn {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.8);
            padding: 1.5rem;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .stat-card h3 {
            color: #666;
            font-size: 0.9rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #333;
            margin: 0;
        }

        .management-section {
            margin-bottom: 2rem;
            background: rgba(255, 255, 255, 0.6);
            border-radius: 15px;
            padding: 1.5rem;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }

        .section-header h3 {
            color: #333;
            font-weight: 500;
            margin: 0;
        }

        .action-buttons {
            display: flex;
            gap: 0.5rem;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
            background: rgba(108, 117, 125, 0.1);
            color: #6c757d;
            border: 1px solid rgba(108, 117, 125, 0.3);
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .btn-secondary:hover {
            background: rgba(108, 117, 125, 0.2);
            transform: translateY(-1px);
        }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .data-table th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .data-table td {
            padding: 1rem;
            border-bottom: 1px solid #e1e5e9;
            font-size: 0.9rem;
        }

        .data-table tr:hover {
            background: rgba(102, 126, 234, 0.05);
        }

        .users-table-container {
            overflow-x: auto;
            border-radius: 10px;
        }

        .transactions-list {
            max-height: 300px;
            overflow-y: auto;
            background: white;
            border-radius: 10px;
            padding: 1rem;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .transaction-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            border-bottom: 1px solid #e1e5e9;
            transition: background 0.2s ease;
        }

        .transaction-item:hover {
            background: rgba(102, 126, 234, 0.05);
        }

        .transaction-item:last-child {
            border-bottom: none;
        }

        .transaction-info {
            flex: 1;
        }

        .transaction-type {
            font-weight: 600;
            color: #333;
        }

        .transaction-amount {
            font-weight: 700;
            color: #28a745;
        }

        .transaction-amount.spent {
            color: #dc3545;
        }

        .transaction-time {
            color: #666;
            font-size: 0.8rem;
        }

        .user-actions {
            display: flex;
            gap: 0.5rem;
        }

        .btn-small {
            padding: 0.25rem 0.5rem;
            font-size: 0.8rem;
            border-radius: 5px;
        }

        .btn-success {
            background: #28a745;
            color: white;
            border: none;
        }

        .btn-danger {
            background: #dc3545;
            color: white;
            border: none;
        }

        .btn-info {
            background: #17a2b8;
            color: white;
            border: none;
        }

        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            border: none;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: all 0.3s ease;
            width: 100%;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        button:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }

        button:active {
            transform: translateY(-1px);
        }

        #logout {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
            margin-top: 2rem;
            max-width: 200px;
            margin-left: auto;
            margin-right: auto;
            display: block;
        }

        #logout:hover {
            box-shadow: 0 8px 25px rgba(255, 107, 107, 0.4);
        }

        .hidden {
            display: none !important;
        }

        /* Modal styles */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(5px);
        }

        .modal > div {
            background: white;
            padding: 2rem;
            border-radius: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .modal h2 {
            color: #333;
            margin-bottom: 1rem;
            font-weight: 300;
        }

        .modal h3 {
            color: #555;
            margin-bottom: 1rem;
            font-weight: 400;
        }

        /* Responsive design */
        @media (max-width: 768px) {
            main {
                padding: 1rem;
            }
            
            #login-section, #dashboard {
                padding: 1.5rem;
            }
            
            #controls ul {
                grid-template-columns: 1fr;
            }
            
            header h1 {
                font-size: 1.5rem;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>Pluct Business Engine Admin Panel</h1>
    </header>
    <main>
        <section id="login-section">
            <h2>Admin Login</h2>
            <form id="login-form">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>

                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>

                <button type="submit">Login</button>
            </form>
        </section>

        <section id="dashboard" class="hidden">
            <div class="dashboard-header">
                <h2>Pluct Business Engine Dashboard</h2>
                <button id="logout" class="logout-btn">Logout</button>
            </div>

            <!-- System Statistics -->
            <div id="system-stats" class="stats-grid">
                <div class="stat-card">
                    <h3>Total Users</h3>
                    <div class="stat-value" id="total-users">-</div>
                </div>
                <div class="stat-card">
                    <h3>Total Credits</h3>
                    <div class="stat-value" id="total-credits">-</div>
                </div>
                <div class="stat-card">
                    <h3>Credits Added</h3>
                    <div class="stat-value" id="credits-added">-</div>
                </div>
                <div class="stat-card">
                    <h3>Credits Spent</h3>
                    <div class="stat-value" id="credits-spent">-</div>
                </div>
                <div class="stat-card">
                    <h3>Total Transactions</h3>
                    <div class="stat-value" id="total-transactions">-</div>
                </div>
                <div class="stat-card">
                    <h3>API Keys</h3>
                    <div class="stat-value" id="total-api-keys">-</div>
                </div>
            </div>

            <!-- User Management Section -->
            <div class="management-section">
                <div class="section-header">
                    <h3>User Management</h3>
                    <div class="action-buttons">
                        <button id="refresh-users" class="btn-secondary">Refresh</button>
                        <button id="add-user-credits" class="btn-primary">Add Credits</button>
                        <button id="generate-keys" class="btn-primary">Generate API Key</button>
                    </div>
                </div>
                
                <div class="users-table-container">
                    <table id="users-table" class="data-table">
                        <thead>
                            <tr>
                                <th>User ID</th>
                                <th>Current Credits</th>
                                <th>Total Added</th>
                                <th>Total Spent</th>
                                <th>Transactions</th>
                                <th>Last Activity</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="users-table-body">
                            <!-- Users will be populated here -->
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Recent Transactions -->
            <div class="management-section">
                <div class="section-header">
                    <h3>Recent Transactions</h3>
                    <button id="view-all-transactions" class="btn-secondary">View All</button>
                </div>
                <div id="recent-transactions" class="transactions-list">
                    <!-- Recent transactions will be populated here -->
                </div>
            </div>
        </section>
    </main>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const loginForm = document.getElementById("login-form");
            const dashboard = document.getElementById("dashboard");
            const loginSection = document.getElementById("login-section");
            const logoutButton = document.getElementById("logout");
            const refreshUsersBtn = document.getElementById("refresh-users");
            const addUserCreditsBtn = document.getElementById("add-user-credits");
            const generateKeysBtn = document.getElementById("generate-keys");
            const viewAllTransactionsBtn = document.getElementById("view-all-transactions");

            // Login functionality
            loginForm.addEventListener("submit", (event) => {
                event.preventDefault();
                const username = document.getElementById("username").value;
                const password = document.getElementById("password").value;

                if (username === "admin" && password === "admin123") {
                    loginSection.style.display = "none";
                    dashboard.style.display = "block";
                    loadDashboard();
                } else {
                    alert("Invalid credentials");
                }
            });

            // Logout functionality
            logoutButton.addEventListener("click", () => {
                dashboard.style.display = "none";
                loginSection.style.display = "block";
            });

            // Load dashboard data
            async function loadDashboard() {
                await Promise.all([
                    loadSystemStats(),
                    loadUsers(),
                    loadRecentTransactions()
                ]);
            }

            // Load system statistics
            async function loadSystemStats() {
                try {
                    const response = await fetch('/admin/stats');
                    const data = await response.json();
                    
                    if (data) {
                        document.getElementById('total-users').textContent = data.total_users || 0;
                        document.getElementById('total-credits').textContent = data.total_current_credits || 0;
                        document.getElementById('credits-added').textContent = data.total_credits_added || 0;
                        document.getElementById('credits-spent').textContent = data.total_credits_spent || 0;
                        document.getElementById('total-transactions').textContent = data.total_transactions || 0;
                        document.getElementById('total-api-keys').textContent = data.total_api_keys || 0;
                    }
                } catch (error) {
                    console.error('Error loading stats:', error);
                }
            }

            // Load users
            async function loadUsers() {
                try {
                    const response = await fetch('/admin/users');
                    const data = await response.json();
                    
                    if (data.users) {
                        displayUsersTable(data.users);
                    }
                } catch (error) {
                    console.error('Error loading users:', error);
                }
            }

            // Load recent transactions
            async function loadRecentTransactions() {
                try {
                    const response = await fetch('/admin/transactions');
                    const data = await response.json();
                    
                    if (data.transactions) {
                        displayRecentTransactions(data.transactions.slice(0, 10));
                    }
                } catch (error) {
                    console.error('Error loading transactions:', error);
                }
            }

            // Display users in table
            function displayUsersTable(users) {
                const tbody = document.getElementById('users-table-body');
                tbody.innerHTML = '';
                
                users.forEach(user => {
                    const row = document.createElement('tr');
                    row.innerHTML = \`
                        <td>\${user.user_id}</td>
                        <td>\${user.credits}</td>
                        <td>\${user.total_added || 0}</td>
                        <td>\${user.total_spent || 0}</td>
                        <td>\${user.transaction_count || 0}</td>
                        <td>\${user.last_activity ? new Date(user.last_activity).toLocaleString() : 'Never'}</td>
                        <td>
                            <div class="user-actions">
                                <button class="btn-small btn-info" onclick="viewUserDetails('\${user.user_id}')">View</button>
                                <button class="btn-small btn-success" onclick="addCreditsToUser('\${user.user_id}')">Add Credits</button>
                                <button class="btn-small btn-danger" onclick="deductCreditsFromUser('\${user.user_id}')">Deduct</button>
                            </div>
                        </td>
                    \`;
                    tbody.appendChild(row);
                });
            }

            // Display recent transactions
            function displayRecentTransactions(transactions) {
                const container = document.getElementById('recent-transactions');
                container.innerHTML = '';
                
                if (transactions.length === 0) {
                    container.innerHTML = '<p style="text-align: center; color: #666;">No recent transactions</p>';
                    return;
                }
                
                transactions.forEach(transaction => {
                    const item = document.createElement('div');
                    item.className = 'transaction-item';
                    
                    const isSpent = transaction.type === 'spend' || transaction.type === 'admin_deduct';
                    const amountClass = isSpent ? 'spent' : '';
                    
                    item.innerHTML = \`
                        <div class="transaction-info">
                            <div class="transaction-type">\${transaction.user_id} - \${transaction.type}</div>
                            <div class="transaction-time">\${new Date(transaction.timestamp).toLocaleString()}</div>
                        </div>
                        <div class="transaction-amount \${amountClass}">\${isSpent ? '-' : '+'}\${transaction.amount}</div>
                    \`;
                    
                    container.appendChild(item);
                });
            }

            // Event listeners
            refreshUsersBtn.addEventListener("click", loadDashboard);
            
            addUserCreditsBtn.addEventListener("click", () => {
                const userId = prompt("Enter User ID:");
                if (userId) {
                    addCreditsToUser(userId);
                }
            });

            generateKeysBtn.addEventListener("click", async () => {
                const description = prompt("Enter description for the API key:");
                if (description) {
                    try {
                        const response = await fetch('/admin/generate-key', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ description })
                        });
                        const data = await response.json();
                        
                        if (data.apiKey) {
                            alert('API Key generated: ' + data.apiKey);
                            loadDashboard(); // Refresh dashboard
                        } else {
                            alert('Error generating API key: ' + (data.error || 'Unknown error'));
                        }
                    } catch (error) {
                        alert('Error generating API key: ' + error.message);
                    }
                }
            });

            viewAllTransactionsBtn.addEventListener("click", async () => {
                try {
                    const response = await fetch('/admin/transactions');
                    const data = await response.json();
                    
                    if (data.transactions) {
                        showTransactionsModal(data.transactions);
                    } else {
                        alert('Error fetching transactions: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error fetching transactions: ' + error.message);
                }
            });

            // Global functions for user actions
            window.viewUserDetails = async function(userId) {
                try {
                    const response = await fetch(\`/admin/users/\${userId}\`);
                    const data = await response.json();
                    
                    if (data) {
                        showUserDetailsModal(data);
                    } else {
                        alert('Error fetching user details: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error fetching user details: ' + error.message);
                }
            };

            window.addCreditsToUser = function(userId) {
                const amount = prompt(\`Enter amount of credits to add to \${userId}:\`);
                if (amount && !isNaN(amount) && parseInt(amount) > 0) {
                    const reason = prompt("Enter reason (optional):");
                    addCredits(userId, parseInt(amount), reason);
                }
            };

            window.deductCreditsFromUser = function(userId) {
                const amount = prompt(\`Enter amount of credits to deduct from \${userId}:\`);
                if (amount && !isNaN(amount) && parseInt(amount) > 0) {
                    const reason = prompt("Enter reason (optional):");
                    deductCredits(userId, parseInt(amount), reason);
                }
            };

            // Add credits function
            async function addCredits(userId, amount, reason) {
                try {
                    const response = await fetch('/admin/add-credits', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userId, amount, reason })
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        alert(\`Successfully added \${amount} credits to \${userId}. New balance: \${data.newBalance}\`);
                        loadDashboard(); // Refresh dashboard
                    } else {
                        alert('Error adding credits: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error adding credits: ' + error.message);
                }
            }

            // Deduct credits function
            async function deductCredits(userId, amount, reason) {
                try {
                    const response = await fetch('/admin/deduct-credits', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userId, amount, reason })
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        alert(\`Successfully deducted \${amount} credits from \${userId}. New balance: \${data.newBalance}\`);
                        loadDashboard(); // Refresh dashboard
                    } else {
                        alert('Error deducting credits: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error deducting credits: ' + error.message);
                }
            }

            // Show user details modal
            function showUserDetailsModal(user) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.cssText = \`
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                \`;
                
                modal.innerHTML = \`
                    <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 80%; max-height: 80%; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                        <h2>User Details: \${user.user_id}</h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
                            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
                                <strong>Current Credits:</strong><br>
                                <span style="font-size: 1.5rem; color: #28a745;">\${user.current_credits}</span>
                            </div>
                            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
                                <strong>Total Added:</strong><br>
                                <span style="font-size: 1.5rem; color: #28a745;">\${user.total_added}</span>
                            </div>
                            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
                                <strong>Total Spent:</strong><br>
                                <span style="font-size: 1.5rem; color: #dc3545;">\${user.total_spent}</span>
                            </div>
                            <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
                                <strong>Transactions:</strong><br>
                                <span style="font-size: 1.5rem; color: #333;">\${user.transaction_count}</span>
                            </div>
                        </div>
                        <h3>Recent Transactions</h3>
                        <div style="max-height: 300px; overflow-y: auto;">
                            \${user.transactions.map(tx => \`
                                <div style="border-bottom: 1px solid #eee; padding: 0.5rem 0;">
                                    <strong>\${tx.type}</strong> - \${tx.amount} credits<br>
                                    <small style="color: #666;">\${new Date(tx.timestamp).toLocaleString()}</small>
                                    \${tx.reason ? \`<br><small style="color: #666;">\${tx.reason}</small>\` : ''}
                                </div>
                            \`).join('')}
                        </div>
                        <button onclick="this.closest('.modal').remove()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
                    </div>
                \`;
                
                document.body.appendChild(modal);
            }

            // Show transactions modal
            function showTransactionsModal(transactions) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.cssText = \`
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                \`;
                
                modal.innerHTML = \`
                    <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 90%; max-height: 90%; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                        <h2>All Transactions (\${transactions.length})</h2>
                        <div style="max-height: 500px; overflow-y: auto;">
                            \${transactions.map(tx => \`
                                <div style="border-bottom: 1px solid #eee; padding: 1rem 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <strong>\${tx.user_id}</strong> - \${tx.type}<br>
                                            <small style="color: #666;">\${new Date(tx.timestamp).toLocaleString()}</small>
                                            \${tx.reason ? \`<br><small style="color: #666;">\${tx.reason}</small>\` : ''}
                                        </div>
                                        <div style="font-size: 1.2rem; font-weight: bold; color: \${tx.type === 'spend' || tx.type === 'admin_deduct' ? '#dc3545' : '#28a745'};">
                                            \${tx.type === 'spend' || tx.type === 'admin_deduct' ? '-' : '+'}\${tx.amount}
                                        </div>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                        <button onclick="this.closest('.modal').remove()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
                    </div>
                \`;
                
                document.body.appendChild(modal);
            }
        });
    </script>
</body>
</html>`;
  
  return c.html(html);
});

/**
 * Endpoint to vend a single-use JWT for a premium API call.
 * The mobile app will call this endpoint before it calls the premium backend.
 * POST /vend-token
 * Body: { "userId": "some-unique-user-id" }
 */
app.post('/vend-token', async (c) => {
  const { userId } = await c.req.json<{ userId: string }>();

  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  // Get the user's current credit balance from our KV database.
  const creditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
  const credits = creditsStr ? parseInt(creditsStr, 10) : 0;

  if (credits <= 0) {
    return c.json({ error: 'Insufficient credits' }, 403);
  }

  // Decrement the user's credit balance.
  await c.env.PLUCT_KV.put(`user:${userId}`, (credits - 1).toString());
  
  // Log the transaction
  const transactionId = crypto.randomUUID();
  const transaction = {
    id: transactionId,
    user_id: userId,
    type: 'spend',
    amount: 1,
    timestamp: new Date().toISOString()
  };
  await c.env.PLUCT_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));

  // Create a short-lived (60 seconds) JSON Web Token (JWT).
  const payload = {
    sub: userId,
    jti: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  
  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  
  // CORRECTED SIGNING CALL (removed 'jose.')
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);

  return c.json({ token: jwt });
});

/**
 * Webhook endpoint for the payment provider (e.g., M-Pesa).
 * The payment provider will call this after a successful transaction.
 * POST /add-credits
 * Headers: { "x-webhook-secret": "our-secret-string" }
 * Body: { "userId": "some-unique-user-id", "amount": 10 }
 */
app.post('/add-credits', async (c) => {
  const providedSecret = c.req.header('x-webhook-secret');
  if (providedSecret !== c.env.WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { userId, amount } = await c.req.json<{ userId: string; amount: number }>();

  if (!userId || !amount || amount <= 0) {
    return c.json({ error: 'User ID and positive amount are required' }, 400);
  }

  const currentCreditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
  const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
  const newCredits = currentCredits + amount;

  await c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString());
  
  // Log the transaction
  const transactionId = crypto.randomUUID();
  const transaction = {
    id: transactionId,
    user_id: userId,
    type: 'add',
    amount: amount,
    timestamp: new Date().toISOString()
  };
  await c.env.PLUCT_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));

  console.log(`Credited user ${userId} with ${amount} credits. New balance: ${newCredits}`);
  return c.json({ success: true, newBalance: newCredits });
});

// Endpoint to view all users with detailed information
app.get('/admin/users', async (c) => {
  try {
    // Get all keys from KV that start with 'user:'
    const list = await c.env.PLUCT_KV.list({ prefix: 'user:' });
    const users = [];
    
    for (const key of list.keys) {
      const credits = await c.env.PLUCT_KV.get(key.name);
      const userId = key.name.replace('user:', '');
      
      // Get user's transaction history
      const transactionList = await c.env.PLUCT_KV.list({ prefix: `transaction:` });
      const userTransactions = [];
      
      for (const txKey of transactionList.keys) {
        const txData = await c.env.PLUCT_KV.get(txKey.name);
        if (txData) {
          const transaction = JSON.parse(txData);
          if (transaction.user_id === userId) {
            userTransactions.push(transaction);
          }
        }
      }
      
      // Calculate usage stats
      const totalSpent = userTransactions
        .filter(tx => tx.type === 'spend')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const totalAdded = userTransactions
        .filter(tx => tx.type === 'add')
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      const lastActivity = userTransactions.length > 0 
        ? userTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp
        : null;
      
      users.push({
        user_id: userId,
        credits: parseInt(credits || '0', 10),
        total_added: totalAdded,
        total_spent: totalSpent,
        transaction_count: userTransactions.length,
        last_activity: lastActivity,
        created_at: userTransactions.length > 0 
          ? userTransactions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0].timestamp
          : null
      });
    }
    
    // Sort users by last activity (most recent first)
    users.sort((a, b) => {
      if (!a.last_activity && !b.last_activity) return 0;
      if (!a.last_activity) return 1;
      if (!b.last_activity) return -1;
      return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
    });
    
    return c.json({ users });
  } catch (error) {
    return c.json({ error: 'Failed to fetch users' }, 500);
  }
});

// Endpoint to generate API keys
app.post('/admin/generate-key', async (c) => {
  try {
  const { description } = await c.req.json<{ description: string }>();
  const apiKey = crypto.randomUUID();

    // Store API key in KV with metadata
    const keyData = {
      key: apiKey,
      description,
      created_at: new Date().toISOString()
    };
    
    await c.env.PLUCT_KV.put(`api_key:${apiKey}`, JSON.stringify(keyData));
    
    return c.json({ apiKey });
  } catch (error) {
    return c.json({ error: 'Failed to generate API key' }, 500);
  }
});

// Endpoint to view transactions
app.get('/admin/transactions', async (c) => {
  try {
    // Get all transaction keys from KV
    const list = await c.env.PLUCT_KV.list({ prefix: 'transaction:' });
    const transactions = [];
    
    for (const key of list.keys) {
      const transactionData = await c.env.PLUCT_KV.get(key.name);
      if (transactionData) {
        transactions.push(JSON.parse(transactionData));
      }
    }
    
    // Sort by timestamp (newest first)
    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return c.json({ transactions });
  } catch (error) {
    return c.json({ error: 'Failed to fetch transactions' }, 500);
  }
});

// Endpoint to manually add credits to a user (admin function)
app.post('/admin/add-credits', async (c) => {
  try {
    const { userId, amount, reason } = await c.req.json<{ userId: string; amount: number; reason?: string }>();
    
    if (!userId || !amount || amount <= 0) {
      return c.json({ error: 'User ID and positive amount are required' }, 400);
    }
    
    const currentCreditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
    const newCredits = currentCredits + amount;
    
    await c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString());
    
    // Log the transaction
    const transactionId = crypto.randomUUID();
    const transaction = {
      id: transactionId,
      user_id: userId,
      type: 'admin_add',
      amount: amount,
      reason: reason || 'Manual credit addition by admin',
      timestamp: new Date().toISOString()
    };
    await c.env.PLUCT_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));
    
    return c.json({ 
      success: true, 
      newBalance: newCredits,
      message: `Added ${amount} credits to user ${userId}` 
    });
  } catch (error) {
    return c.json({ error: 'Failed to add credits' }, 500);
  }
});

// Endpoint to manually deduct credits from a user (admin function)
app.post('/admin/deduct-credits', async (c) => {
  try {
    const { userId, amount, reason } = await c.req.json<{ userId: string; amount: number; reason?: string }>();
    
    if (!userId || !amount || amount <= 0) {
      return c.json({ error: 'User ID and positive amount are required' }, 400);
    }
    
    const currentCreditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const currentCredits = currentCreditsStr ? parseInt(currentCreditsStr, 10) : 0;
    
    if (currentCredits < amount) {
      return c.json({ error: 'Insufficient credits to deduct' }, 400);
    }
    
    const newCredits = currentCredits - amount;
    await c.env.PLUCT_KV.put(`user:${userId}`, newCredits.toString());
    
    // Log the transaction
    const transactionId = crypto.randomUUID();
    const transaction = {
      id: transactionId,
      user_id: userId,
      type: 'admin_deduct',
      amount: amount,
      reason: reason || 'Manual credit deduction by admin',
      timestamp: new Date().toISOString()
    };
    await c.env.PLUCT_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));
    
    return c.json({ 
      success: true, 
      newBalance: newCredits,
      message: `Deducted ${amount} credits from user ${userId}` 
    });
  } catch (error) {
    return c.json({ error: 'Failed to deduct credits' }, 500);
  }
});

// Endpoint to get system statistics
app.get('/admin/stats', async (c) => {
  try {
    // Get all users
    const userList = await c.env.PLUCT_KV.list({ prefix: 'user:' });
    const totalUsers = userList.keys.length;
    
    // Get all transactions
    const transactionList = await c.env.PLUCT_KV.list({ prefix: 'transaction:' });
    const transactions = [];
    
    for (const key of transactionList.keys) {
      const transactionData = await c.env.PLUCT_KV.get(key.name);
      if (transactionData) {
        transactions.push(JSON.parse(transactionData));
      }
    }
    
    // Calculate statistics
    const totalCreditsAdded = transactions
      .filter(tx => tx.type === 'add' || tx.type === 'admin_add')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const totalCreditsSpent = transactions
      .filter(tx => tx.type === 'spend' || tx.type === 'admin_deduct')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const totalTransactions = transactions.length;
    
    // Get current total credits in system
    let totalCurrentCredits = 0;
    for (const key of userList.keys) {
      const credits = await c.env.PLUCT_KV.get(key.name);
      totalCurrentCredits += parseInt(credits || '0', 10);
    }
    
    // Get API keys
    const apiKeyList = await c.env.PLUCT_KV.list({ prefix: 'api_key:' });
    const totalApiKeys = apiKeyList.keys.length;
    
    return c.json({
      total_users: totalUsers,
      total_current_credits: totalCurrentCredits,
      total_credits_added: totalCreditsAdded,
      total_credits_spent: totalCreditsSpent,
      total_transactions: totalTransactions,
      total_api_keys: totalApiKeys,
      net_credits: totalCreditsAdded - totalCreditsSpent
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch statistics' }, 500);
  }
});

// Endpoint to get user details
app.get('/admin/users/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    
    // Get user credits
    const creditsStr = await c.env.PLUCT_KV.get(`user:${userId}`);
    const credits = creditsStr ? parseInt(creditsStr, 10) : 0;
    
    // Get user's transactions
    const transactionList = await c.env.PLUCT_KV.list({ prefix: 'transaction:' });
    const userTransactions = [];
    
    for (const key of transactionList.keys) {
      const transactionData = await c.env.PLUCT_KV.get(key.name);
      if (transactionData) {
        const transaction = JSON.parse(transactionData);
        if (transaction.user_id === userId) {
          userTransactions.push(transaction);
        }
      }
    }
    
    // Sort transactions by timestamp (newest first)
    userTransactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Calculate stats
    const totalAdded = userTransactions
      .filter(tx => tx.type === 'add' || tx.type === 'admin_add')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const totalSpent = userTransactions
      .filter(tx => tx.type === 'spend' || tx.type === 'admin_deduct')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    return c.json({
      user_id: userId,
      current_credits: credits,
      total_added: totalAdded,
      total_spent: totalSpent,
      transaction_count: userTransactions.length,
      transactions: userTransactions.slice(0, 50), // Limit to last 50 transactions
      created_at: userTransactions.length > 0 
        ? userTransactions[userTransactions.length - 1].timestamp
        : null,
      last_activity: userTransactions.length > 0 
        ? userTransactions[0].timestamp
        : null
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user details' }, 500);
  }
});

export default app;