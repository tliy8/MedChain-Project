// js/services/auth.service.js
import { api } from './api.service.js';

export const authService = {
    
    async login(username, password) {
        const response = await api.post('/auth/login', { username, password });
        
        // Save Credentials
        localStorage.setItem('token', response.token);
        localStorage.setItem('fabricId', response.fabric_id);
        localStorage.setItem('name',response.name);
        localStorage.setItem('role', response.role);
        localStorage.setItem('org', response.org);
        
        return response;
    },
    async register(userData){
        const payload={
            ...userData,
            role:'patient',
            org:'Org1'
        };
        const response = await api.post('/user/register',payload);
        return response;
    },

    logout() {
        localStorage.clear();
        window.location.href = 'login.html';
    },

    getUserRole() {
        return localStorage.getItem('role');
    },

    isAuthenticated() {
        return !!localStorage.getItem('token');
    }
};