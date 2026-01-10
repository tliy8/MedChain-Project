// js/services/api.service.js

const BASE_URL = 'http://localhost:3000/api';

/**
 * Generic Fetch Wrapper to handle Headers and Errors
 */
async function request(endpoint, method = 'GET', body = null) {
    // 1. Get Token automatically
    const token = localStorage.getItem('token');

    // 2. Set Headers
    const headers = {
        'Content-Type': 'application/json',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 3. Configure Request
    const config = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        const data = await response.json();

        // 4. Handle Errors Globally
        if (!response.ok) {
            throw new Error(data.error || data.message || 'API Error');
        }

        return data;
    } catch (error) {
        console.error(`API Request Failed: ${endpoint}`, error);
        throw error; // Re-throw so the page can show a Toast notification
    }
}

// Export specific methods
export const api = {
    get: (endpoint) => request(endpoint, 'GET'),
    post: (endpoint, body) => request(endpoint, 'POST', body),
    put: (endpoint, body) => request(endpoint, 'PUT', body),
    delete: (endpoint) => request(endpoint, 'DELETE'),
};