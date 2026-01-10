// js/create.js
import { authService } from './services/auth.service.js';

// Setup Toastify helper
const showToast = (text, type = 'success') => {
    Toastify({
        text: text,
        backgroundColor: type === 'error' ? "#EF4444" : "#10B981",
        duration: 3000
    }).showToast();
};

// Initialize Animations
AOS.init({ duration: 800, once: true });

// Toggle Password Logic (Exported to window scope so HTML onclick works, or attach event listeners)
window.togglePassword = function(inputId, iconId) {
    const passwordInput = document.getElementById(inputId);
    const eyeIcon = document.getElementById(iconId);
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.innerText = 'visibility_off';
    } else {
        passwordInput.type = 'password';
        eyeIcon.innerText = 'visibility';
    }
};

// Form Handling
const signupForm = document.getElementById('signupForm');
const passwordError = document.getElementById('passwordError');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Get form values
    const name = document.getElementById('name').value;
    const userId = document.getElementById('userId').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validation
    if (password !== confirmPassword) {
        passwordError.classList.remove('hidden');
        document.getElementById('confirmPassword').classList.add('border-red-500');
        showToast("Passwords do not match", 'error');
        return;
    } else {
        passwordError.classList.add('hidden');
        document.getElementById('confirmPassword').classList.remove('border-red-500');
    }

    // UI Loading State
    submitBtn.disabled = true;
    btnText.innerText = "Registering...";
    btnLoader.classList.remove('hidden');

    try {
        // Call the service
        await authService.register({
            userId: userId,
            name: name,
            password: password
        });

        showToast("Registration Successful! Redirecting...");

        // Redirect to login after success
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);

    } catch (error) {
        showToast(error.message || "Registration failed", 'error');
        
        // Reset Button
        submitBtn.disabled = false;
        btnText.innerText = "Create Account";
        btnLoader.classList.add('hidden');
    }
});