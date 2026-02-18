import { Platform } from 'react-native';
import { storage } from '../utils/storage';

const BASE_URL = Platform.select({
  android: 'http://10.0.2.2:8000/api',
  ios: 'http://localhost:8000/api',
  web: 'http://localhost:8000/api',
  default: 'http://localhost:8000/api',
});

export const api = {

  get: async (endpoint: string, token?: string): Promise<any> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!token) {
    try {
      token = (await storage.getAccessToken()) || undefined;
    } catch (error) {
      console.log('Error retrieving token:', error);
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const url = `${BASE_URL}${endpoint}`;
    console.log('Fetching:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    console.log('Status:', response.status);

    if (!response.ok) {
      console.log('API Error:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('Data:', data);
    return data;

  } catch (error) {
    console.log('Fetch Error:', error);
    return [];
  }
},


post: async (endpoint: string, body: object, token?: string): Promise<any> => {

  // if (!token) {
  //   try {
  //     token = (await storage.getAccessToken()) || undefined;
  //   } catch (error) {
  //     console.log('Error retrieving token:', error);
  //   }
  // }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  console.log("", await storage.getAccessToken());

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log("Token for POST:", token);
  console.log("Headers:", headers);

  try {
    const url = `${BASE_URL}${endpoint}`;
    console.log('Posting to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data;

  } catch (error) {
    console.log('Post Error:', error);
    return null;
  }
},


//   delete: async (endpoint: string, token?: string): Promise<any> => {
//   const headers: Record<string, string> = {
//     'Content-Type': 'application/json',
//   };

//   if (!token) {
//     try {
//       token = await storage.getToken();
//     } catch (error) {
//       console.log('Error retrieving token:', error);
//     }
//   }

//   if (token) {
//     headers['Authorization'] = `Bearer ${token}`;
//   }

//   try {
//     const url = `${BASE_URL}${endpoint}`;
//     const response = await fetch(url, {
//       method: 'DELETE',
//       headers,
//     });

//     if (!response.ok) {
//       return { success: false };
//     }

//     return { success: true };
//   } catch (error) {
//     console.log('Delete Error:', error);
//     return { success: false };
//   }
// },

};