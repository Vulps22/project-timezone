const path = require('path');
const fs = require('fs');

// Mock sqlite3 database
const mockDatabase = {
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
    prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(),
        finalize: jest.fn()
    }))
};

jest.mock('sqlite3', () => ({
    Database: jest.fn().mockImplementation(() => mockDatabase)
}));

// Import the service under test
let databaseService;

describe('DatabaseService', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        
        // Reset mock database
        Object.keys(mockDatabase).forEach(key => {
            if (typeof mockDatabase[key] === 'function') {
                mockDatabase[key].mockReset();
            }
        });

        // Mock successful database operations by default
        mockDatabase.run.mockImplementation((query, params, callback) => {
            if (callback) callback(null);
        });
        mockDatabase.get.mockImplementation((query, params, callback) => {
            if (callback) callback(null, {});
        });
        mockDatabase.all.mockImplementation((query, params, callback) => {
            if (callback) callback(null, []);
        });
        mockDatabase.exec.mockImplementation((query, callback) => {
            if (callback) callback(null);
        });

        databaseService = require('../databaseService');
    });

    describe('Database Initialization', () => {
        test('should initialize database with correct tables', () => {
            expect(mockDatabase.exec).toHaveBeenCalled();
            
            const execCalls = mockDatabase.exec.mock.calls;
            const createTableCalls = execCalls.filter(call => 
                call[0].includes('CREATE TABLE')
            );

            expect(createTableCalls.length).toBeGreaterThan(0);
        });

        test('should handle database initialization errors', () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockDatabase.exec.mockImplementation((query, callback) => {
                if (callback) callback(new Error('DB Init Error'));
            });

            // Re-require to trigger initialization
            jest.resetModules();
            require('../databaseService');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Database initialization error:',
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('User Management', () => {
        test('should set user timezone successfully', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const result = await databaseService.setUserTimezone('user123', 'America/New_York');
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE'),
                ['user123', 'America/New_York'],
                expect.any(Function)
            );
        });

        test('should handle set timezone errors', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const result = await databaseService.setUserTimezone('user123', 'America/New_York');
            
            expect(result).toBe(false);
        });

        test('should get user timezone successfully', async () => {
            const mockUser = {
                user_id: 'user123',
                timezone_identifier: 'America/New_York'
            };

            mockDatabase.get.mockImplementation((query, params, callback) => {
                callback(null, mockUser);
            });

            const result = await databaseService.getUserTimezone('user123');
            
            expect(result).toEqual(mockUser);
            expect(mockDatabase.get).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                ['user123'],
                expect.any(Function)
            );
        });

        test('should return null for non-existent user', async () => {
            mockDatabase.get.mockImplementation((query, params, callback) => {
                callback(null, null);
            });

            const result = await databaseService.getUserTimezone('nonexistent');
            
            expect(result).toBe(null);
        });

        test('should clear user data successfully', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const result = await databaseService.clearUserData('user123');
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM users'),
                ['user123'],
                expect.any(Function)
            );
        });
    });

    describe('Server Management', () => {
        test('should add user to server successfully', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const result = await databaseService.addUserToServer('user123', 'server456');
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR IGNORE'),
                ['user123', 'server456'],
                expect.any(Function)
            );
        });

        test('should remove user from server successfully', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const result = await databaseService.removeUserFromServer('user123', 'server456');
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM user_servers'),
                ['user123', 'server456'],
                expect.any(Function)
            );
        });

        test('should get user servers successfully', async () => {
            const mockServers = ['server1', 'server2', 'server3'];
            mockDatabase.all.mockImplementation((query, params, callback) => {
                callback(null, mockServers.map(id => ({ server_id: id })));
            });

            const result = await databaseService.getUserServers('user123');
            
            expect(result).toEqual(mockServers);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT server_id'),
                ['user123'],
                expect.any(Function)
            );
        });
    });

    describe('Timezone Queries', () => {
        test('should get users in timezone successfully', async () => {
            const mockUsers = ['user1', 'user2', 'user3'];
            mockDatabase.all.mockImplementation((query, params, callback) => {
                callback(null, mockUsers.map(id => ({ user_id: id })));
            });

            const result = await databaseService.getUsersInTimezone('America/New_York');
            
            expect(result).toEqual(mockUsers);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT user_id'),
                ['America/New_York'],
                expect.any(Function)
            );
        });

        test('should get active timezones successfully', async () => {
            const mockTimezones = [
                { timezone_identifier: 'America/New_York' },
                { timezone_identifier: 'Europe/London' },
                { timezone_identifier: 'Asia/Tokyo' }
            ];

            mockDatabase.all.mockImplementation((query, params, callback) => {
                callback(null, mockTimezones);
            });

            const result = await databaseService.getActiveTimezones();
            
            expect(result).toEqual(mockTimezones);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT DISTINCT timezone_identifier'),
                expect.any(Function)
            );
        });
    });

    describe('Statistics', () => {
        test('should get comprehensive stats successfully', async () => {
            const mockStats = {
                totalUsers: 150,
                totalConnections: 75,
                popularTimezones: [
                    { timezone_identifier: 'America/New_York', count: 50 },
                    { timezone_identifier: 'Europe/London', count: 30 },
                    { timezone_identifier: 'Asia/Tokyo', count: 20 }
                ]
            };

            // Mock multiple database calls for different stats
            mockDatabase.get
                .mockImplementationOnce((query, callback) => {
                    callback(null, { count: mockStats.totalUsers });
                })
                .mockImplementationOnce((query, callback) => {
                    callback(null, { count: mockStats.totalConnections });
                });

            mockDatabase.all.mockImplementation((query, callback) => {
                callback(null, mockStats.popularTimezones);
            });

            const result = await databaseService.getStats();
            
            expect(result).toEqual(mockStats);
            expect(mockDatabase.get).toHaveBeenCalledTimes(2);
            expect(mockDatabase.all).toHaveBeenCalledTimes(1);
        });

        test('should handle stats errors gracefully', async () => {
            mockDatabase.get.mockImplementation((query, callback) => {
                callback(new Error('Stats error'));
            });

            const result = await databaseService.getStats();
            
            expect(result).toEqual({
                totalUsers: 0,
                totalConnections: 0,
                popularTimezones: []
            });
        });
    });

    describe('DST Schedule Management', () => {
        test('should schedule DST update successfully', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const result = await databaseService.scheduleDSTUpdate('user123', 'America/New_York');
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT OR REPLACE INTO dst_schedule'),
                expect.arrayContaining(['user123', 'America/New_York']),
                expect.any(Function)
            );
        });

        test('should get pending DST updates successfully', async () => {
            const mockUpdates = [
                { user_id: 'user1', timezone_identifier: 'America/New_York' },
                { user_id: 'user2', timezone_identifier: 'Europe/London' }
            ];

            mockDatabase.all.mockImplementation((query, callback) => {
                callback(null, mockUpdates);
            });

            const result = await databaseService.getPendingDSTUpdates();
            
            expect(result).toEqual(mockUpdates);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM dst_schedule'),
                expect.any(Function)
            );
        });

        test('should clear DST schedule successfully', async () => {
            mockDatabase.run.mockImplementation((query, callback) => {
                callback(null);
            });

            const result = await databaseService.clearDSTSchedule();
            
            expect(result).toBe(true);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM dst_schedule'),
                expect.any(Function)
            );
        });
    });

    describe('Database Connection Management', () => {
        test('should close database connection', () => {
            databaseService.close();
            expect(mockDatabase.close).toHaveBeenCalled();
        });

        test('should handle close errors gracefully', () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockDatabase.close.mockImplementation((callback) => {
                if (callback) callback(new Error('Close error'));
            });

            databaseService.close();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error closing database:',
                expect.any(Error)
            );

            consoleErrorSpy.mkRestore();
        });
    });

    describe('Error Handling', () => {
        test('should handle promise rejections in user operations', async () => {
            mockDatabase.run.mockImplementation((query, params, callback) => {
                callback(new Error('Database connection lost'));
            });

            const setResult = await databaseService.setUserTimezone('user123', 'America/New_York');
            const clearResult = await databaseService.clearUserData('user123');
            const addServerResult = await databaseService.addUserToServer('user123', 'server456');

            expect(setResult).toBe(false);
            expect(clearResult).toBe(false);
            expect(addServerResult).toBe(false);
        });

        test('should handle promise rejections in query operations', async () => {
            mockDatabase.get.mockImplementation((query, params, callback) => {
                callback(new Error('Query failed'));
            });

            mockDatabase.all.mockImplementation((query, params, callback) => {
                callback(new Error('Query failed'));
            });

            const userResult = await databaseService.getUserTimezone('user123');
            const serversResult = await databaseService.getUserServers('user123');
            const usersResult = await databaseService.getUsersInTimezone('America/New_York');

            expect(userResult).toBe(null);
            expect(serversResult).toEqual([]);
            expect(usersResult).toEqual([]);
        });
    });

    describe('Performance and Edge Cases', () => {
        test('should handle empty results gracefully', async () => {
            mockDatabase.all.mockImplementation((query, params, callback) => {
                callback(null, []);
            });

            const servers = await databaseService.getUserServers('user123');
            const users = await databaseService.getUsersInTimezone('Unknown/Timezone');
            const timezones = await databaseService.getActiveTimezones();

            expect(servers).toEqual([]);
            expect(users).toEqual([]);
            expect(timezones).toEqual([]);
        });

        test('should handle null and undefined parameters', async () => {
            const nullUserResult = await databaseService.getUserTimezone(null);
            const undefinedUserResult = await databaseService.getUserTimezone(undefined);
            const emptyStringResult = await databaseService.getUserTimezone('');

            // Should handle gracefully without throwing
            expect([null, undefined, {}]).toContain(nullUserResult);
            expect([null, undefined, {}]).toContain(undefinedUserResult);
            expect([null, undefined, {}]).toContain(emptyStringResult);
        });
    });
});
