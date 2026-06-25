import { api } from './api';

export interface CreateUserData {
    name: String,
    username: String,
    password: String,
    email?: String,
    phone?: String,
    role: String,
    company?: number | null;
    main_group?: number[];
    state?: number[];
}

export const userService = {
    createUser: async (data: any) => {
        return await api.post('/auth/users/create/', data);
    },
    users: async () => {
        return await api.get('/auth/users/list/');
    },
    removeUser: async (userId: number) => {
        return await api.post(`/auth/users/${userId}/delete/`, {});
    },
    getUserById: async (id: string | number) => {
        console.log(`Fetching user with IDd: ${JSON.stringify(await api.get(`/auth/users/${id}/`))}`);
        return await api.get(`/auth/users/${id}/`);
    },
    updateUser: async (id: string | number, data: any) => {
        return await api.put(`/auth/users/${id}/`, data);
    },
    getPagePermissions: async (userId: string | number) => {
        return await api.get(`/auth/users/${userId}/page-permissions/`);
    },
    updatePagePermissions: async (userId: string | number, extra_pages: string[]) => {
        return await api.put(`/auth/users/${userId}/page-permissions/`, { extra_pages });
    },
    createScheme: async (data: { scheme_name: string; item_code: string; state_code: string }) => {
        return await api.post('/orders/create-scheme/', data);
    },
    getProductVarieties: async (category?: string): Promise<{ category?: string; count?: number; varieties?: string[] }> => {
        const url = category
            ? `/sap/product-varieties/?category=${encodeURIComponent(category)}`
            : '/sap/product-varieties/';
        return await api.get(url);
    },

}