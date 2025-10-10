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
        const content = `
            <h3>Users (${users.length})</h3>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
                ${users.map(user => `
                    <div style="border-bottom: 1px solid #eee; padding: 5px 0;">
                        <strong>ID:</strong> ${user.user_id}<br>
                        <strong>Credits:</strong> ${user.credits}
                    </div>
                `).join('')}
            </div>
        `;
        showModal('Users', content);
    }

    // Helper function to display transactions
    function displayTransactions(transactions) {
        const content = `
            <h3>Transactions (${transactions.length})</h3>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
                ${transactions.map(transaction => `
                    <div style="border-bottom: 1px solid #eee; padding: 5px 0;">
                        <strong>User:</strong> ${transaction.user_id}<br>
                        <strong>Type:</strong> ${transaction.type}<br>
                        <strong>Amount:</strong> ${transaction.amount}<br>
                        <strong>Time:</strong> ${new Date(transaction.timestamp).toLocaleString()}
                    </div>
                `).join('')}
            </div>
        `;
        showModal('Transactions', content);
    }

    // Helper function to show modal
    function showModal(title, content) {
        const modal = document.createElement('div');
        modal.style.cssText = `
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
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 8px; max-width: 80%; max-height: 80%; overflow-y: auto;">
                <h2>${title}</h2>
                ${content}
                <button onclick="this.closest('.modal').remove()" style="margin-top: 10px;">Close</button>
            </div>
        `;
        
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
});