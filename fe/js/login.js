// js/login.js
import { authService } from './services/auth.service.js';

// Setup Toastify (Assuming it's loaded via CDN in HTML)
const showToast = (text, type = 'success') => {
    Toastify({
        text: text,
        backgroundColor: type === 'error' ? "#EF4444" : "#10B981",
        duration: 3000
    }).showToast();
};

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // UI Loading State
    loginBtn.disabled = true;
    btnText.innerText = "Authenticating...";
    btnLoader.classList.remove('hidden');

    try {
        // CALL THE SERVICE (Clean!)
        const data = await authService.login(username, password);

        showToast("Login Successful! Redirecting...");

        // Redirect logic
        setTimeout(() => {
            if (data.role === 'doctor') {
                window.location.href = 'doc-dashboard.html';
            } else if (data.role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else {
                window.location.href = 'pdashboard.html';
            }
        }, 1500);

    } catch (error) {
        showToast(error.message, 'error');
        loginBtn.disabled = false;
        btnText.innerText = "Sign in";
        btnLoader.classList.add('hidden');
    }
});