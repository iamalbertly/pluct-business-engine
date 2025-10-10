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
            max-width: 1000px;
            width: 100%;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        #dashboard h2 {
            text-align: center;
            margin-bottom: 2rem;
            color: #333;
            font-weight: 300;
            font-size: 1.8rem;
        }

        #controls {
            margin-top: 2rem;
        }

        #controls h3 {
            margin-bottom: 1.5rem;
            color: #555;
            font-weight: 400;
        }

        #controls ul {
            list-style: none;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }

        #controls li {
            display: flex;
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
            <h2>Dashboard</h2>
            <p>Welcome, Admin!</p>
            <button id="logout">Logout</button>

            <div id="controls">
                <h3>Controls</h3>
                <ul>
                    <li><button id="view-users">View Users</button></li>
                    <li><button id="generate-keys">Generate API Keys</button></li>
                    <li><button id="view-transactions">View Transactions</button></li>
                </ul>
            </div>
        </section>
    </main>
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            const loginForm = document.getElementById("login-form");
            const dashboard = document.getElementById("dashboard");
            const loginSection = document.getElementById("login-section");
            const logoutButton = document.getElementById("logout");
            const viewUsersBtn = document.getElementById("view-users");
            const generateKeysBtn = document.getElementById("generate-keys");
            const viewTransactionsBtn = document.getElementById("view-transactions");

            // Login functionality
            loginForm.addEventListener("submit", (event) => {
                event.preventDefault();
                const username = document.getElementById("username").value;
                const password = document.getElementById("password").value;

                if (username === "admin" && password === "admin123") {
                    loginSection.style.display = "none";
                    dashboard.style.display = "block";
                } else {
                    alert("Invalid credentials");
                }
            });

            // Logout functionality
            logoutButton.addEventListener("click", () => {
                dashboard.style.display = "none";
                loginSection.style.display = "block";
            });

            // View Users functionality
            viewUsersBtn.addEventListener("click", async () => {
                try {
                    const response = await fetch('/admin/users');
                    const data = await response.json();
                    
                    if (data.users) {
                        displayUsers(data.users);
                    } else {
                        alert('Error fetching users: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error fetching users: ' + error.message);
                }
            });

            // Generate API Keys functionality
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
                        } else {
                            alert('Error generating API key: ' + (data.error || 'Unknown error'));
                        }
                    } catch (error) {
                        alert('Error generating API key: ' + error.message);
                    }
                }
            });

            // View Transactions functionality
            viewTransactionsBtn.addEventListener("click", async () => {
                try {
                    const response = await fetch('/admin/transactions');
                    const data = await response.json();
                    
                    if (data.transactions) {
                        displayTransactions(data.transactions);
                    } else {
                        alert('Error fetching transactions: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    alert('Error fetching transactions: ' + error.message);
                }
            });

            // Helper function to display users
            function displayUsers(users) {
                const content = \`
                    <h3>Users (\${users.length})</h3>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
                        \${users.map(user => \`
                            <div style="border-bottom: 1px solid #eee; padding: 5px 0;">
                                <strong>ID:</strong> \${user.user_id}<br>
                                <strong>Credits:</strong> \${user.credits}
                            </div>
                        \`).join('')}
                    </div>
                \`;
                showModal('Users', content);
            }

            // Helper function to display transactions
            function displayTransactions(transactions) {
                const content = \`
                    <h3>Transactions (\${transactions.length})</h3>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
                        \${transactions.map(transaction => \`
                            <div style="border-bottom: 1px solid #eee; padding: 5px 0;">
                                <strong>User:</strong> \${transaction.user_id}<br>
                                <strong>Type:</strong> \${transaction.type}<br>
                                <strong>Amount:</strong> \${transaction.amount}<br>
                                <strong>Time:</strong> \${new Date(transaction.timestamp).toLocaleString()}
                            </div>
                        \`).join('')}
                    </div>
                \`;
                showModal('Transactions', content);
            }

            // Helper function to show modal
            function showModal(title, content) {
                const modal = document.createElement('div');
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
                    <div style="background: white; padding: 20px; border-radius: 8px; max-width: 80%; max-height: 80%; overflow-y: auto;">
                        <h2>\${title}</h2>
                        \${content}
                        <button onclick="this.closest('.modal').remove()" style="margin-top: 10px;">Close</button>
                    </div>
                \`;
                
                modal.className = 'modal';
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

// Endpoint to view all users
app.get('/admin/users', async (c) => {
  try {
    // Get all keys from KV that start with 'user:'
    const list = await c.env.PLUCT_KV.list({ prefix: 'user:' });
    const users = [];
    
    for (const key of list.keys) {
      const credits = await c.env.PLUCT_KV.get(key.name);
      users.push({
        user_id: key.name.replace('user:', ''),
        credits: parseInt(credits || '0', 10)
      });
    }
    
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

export default app;