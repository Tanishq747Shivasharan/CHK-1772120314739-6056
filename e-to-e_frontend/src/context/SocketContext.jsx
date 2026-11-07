import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SocketContext } from './socketContextValue';

export const SocketProvider = ({ children, userId }) => {
    const [socket, setSocket] = useState(null);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!userId || !token) {
            return undefined;
        }

        // Strip /api from the URL to get the base server URL for Socket.IO
        const socketUrl = API_URL.replace(/\/api$/, '');
        const newSocket = io(socketUrl, {
            withCredentials: false,
            auth: (callback) => callback({ token: localStorage.getItem('access_token') }),
            transports: ['polling', 'websocket']
        });
        newSocket.on('connect', () => setSocket(newSocket));

        return () => {
            newSocket.close();
            setSocket((current) => current === newSocket ? null : current);
        };
    }, [userId, API_URL]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
