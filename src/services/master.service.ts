import { api } from './api';

export interface State{
    id:number;
    name:string;
    code:string;
}

export interface Company{
    id:number;
    name:string;
}

export interface MainGroup{
    id:number;
    name:string;
}

export interface UserRole {
  id: number;
  name: string;
  display_name: string;
}

export const masterService={
    getStates:async():Promise<State[]>=>{
        return api.get('/auth/states/')
    },

    getCompanies:async():Promise<Company[]>=>{
        return api.get('/auth/companies/')
    },

    getMainGroups:async():Promise<MainGroup[]>=>{
        return api.get('/auth/mainGroup/')
    },

    getRoles: async (): Promise<UserRole[]> => {
      return await api.get('/auth/roles/');
    }
};