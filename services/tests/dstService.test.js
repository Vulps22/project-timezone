const { DateTime } = require('luxon');
const dstService = require('../dstService');

// Mock all dependencies
jest.mock('../databaseService');
jest.mock('../timezoneService');
jest.mock('../../utils/logger');

const databaseService = require('../databaseService');
const timezoneService = require('../timezoneService');
const logger = require('../../utils/logger');

// Mock the clientProvider module
jest.mock('../clientProvider', () => ({
    clientProvider: {
        getClient: jest.fn()
    }
}));

describe('DSTService', () => {
    let mockClient;
    let clientProvider;

    beforeEach(() => {
        // Ensure we start with real timers and clean state
        jest.useRealTimers();
        
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        
        // Get the mocked clientProvider
        clientProvider = require('../clientProvider');
        
        // Mock client with broadcastEval
        mockClient = {
            shard: {
                broadcastEval: jest.fn()
            }
        };
        clientProvider.clientProvider.getClient.mockReturnValue(mockClient);

        // Create proper spies for the DST service methods
        jest.spyOn(dstService, 'checkTimezoneForDST');
        jest.spyOn(dstService, 'updateUsersForDSTChanges');
        
        // Mock database service methods to prevent real calls
        databaseService.getStats.mockResolvedValue({ popularTimezones: [] });
        databaseService.getUsersInTimezone.mockResolvedValue([]);
        databaseService.getUserServers.mockResolvedValue([]);
    });

    afterEach(async () => {
        // Always stop the service to clean up any running intervals
        await dstService.stop();
        
        // Clear all timers to prevent async handle warnings
        if (jest.isMockFunction(setTimeout)) {
            jest.clearAllTimers();
        }
        
        // Clear any real timers that might be hanging around
        jest.clearAllTimers();
        
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('Service Lifecycle', () => {
        test('should start and stop DST service', async () => {
            expect(dstService.getStatus().isRunning).toBe(false);
            
            await dstService.start();
            expect(dstService.getStatus().isRunning).toBe(true);
            expect(console.log).toHaveBeenCalledWith('✅ DST monitoring service started');
            
            await dstService.stop();
            expect(dstService.getStatus().isRunning).toBe(false);
            expect(console.log).toHaveBeenCalledWith('🛑 DST monitoring service stopped');
        });

        test('should not start if already running', async () => {
            await dstService.start();
            await dstService.start(); // Try to start again
            
            expect(console.log).toHaveBeenCalledWith('⚠️ DST Service already running');
        });

        test('should return correct status', async () => {
            expect(dstService.getStatus().isRunning).toBe(false);
            
            await dstService.start();
            expect(dstService.getStatus().isRunning).toBe(true);
            
            await dstService.stop();
            expect(dstService.getStatus().isRunning).toBe(false);
        });
    });

    describe('DST Detection Logic', () => {
        test('should not check DST if not 5am in timezone', async () => {
            // Mock DateTime for non-5am time
            const mockNow = { hour: 10 };
            jest.spyOn(DateTime, 'now').mockReturnValue({
                setZone: jest.fn().mockReturnValue(mockNow)
            });

            const result = await dstService.checkTimezoneForDST('America/New_York');

            expect(result).toBe(false);
            expect(timezoneService.getCurrentOffset).not.toHaveBeenCalled();
        });

        test('should detect no DST change when offsets are same', async () => {
            // Mock DateTime for 5am with same offsets
            const mockNow = { 
                hour: 5, 
                offset: -300,
                minus: jest.fn().mockReturnValue({ offset: -300 })
            };
            
            jest.spyOn(DateTime, 'now').mockReturnValue({
                setZone: jest.fn().mockReturnValue(mockNow)
            });

            timezoneService.getCurrentOffset.mockReturnValue('UTC-5');

            const result = await dstService.checkTimezoneForDST('America/New_York');

            expect(result).toBe(false);
        });

        test('should detect DST change when offsets differ', async () => {
            // Mock DateTime for 5am with different offsets
            const mockNow = { 
                hour: 5, 
                offset: -240,
                minus: jest.fn().mockReturnValue({ offset: -300 })
            };
            
            jest.spyOn(DateTime, 'now').mockReturnValue({
                setZone: jest.fn().mockReturnValue(mockNow)
            });

            timezoneService.getCurrentOffset.mockReturnValue('UTC-4');

            const result = await dstService.checkTimezoneForDST('America/New_York');

            expect(result).toBe(true);
        });

        test('should handle errors gracefully', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            jest.spyOn(DateTime, 'now').mockImplementation(() => {
                throw new Error('DateTime error');
            });

            const result = await dstService.checkTimezoneForDST('America/New_York');

            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('❌ Error checking DST for America/New_York:'),
                expect.any(Error)
            );
        });
    });

    describe('User Updates for DST', () => {
        test('should handle timezone with no users', async () => {
            databaseService.getUsersInTimezone.mockResolvedValue([]);

            await dstService.updateUsersForDSTChanges(['America/New_York']);

            expect(databaseService.getUsersInTimezone).toHaveBeenCalledWith('America/New_York');
            expect(mockClient.shard.broadcastEval).not.toHaveBeenCalled();
        });

        test('should update users across shards successfully', async () => {
            const mockUsers = ['user1', 'user2'];
            
            databaseService.getUsersInTimezone.mockResolvedValue(mockUsers);
            databaseService.getUserServers.mockResolvedValue(['server1', 'server2']);
            
            // Mock the updateUserNicknamesForDST method to return a count
            jest.spyOn(dstService, 'updateUserNicknamesForDST').mockResolvedValue(2);

            await dstService.updateUsersForDSTChanges(['America/New_York']);

            expect(databaseService.getUsersInTimezone).toHaveBeenCalledWith('America/New_York');
            expect(dstService.updateUserNicknamesForDST).toHaveBeenCalledWith('user1', 'America/New_York');
            expect(dstService.updateUserNicknamesForDST).toHaveBeenCalledWith('user2', 'America/New_York');
        });

        test('should handle broadcastEval errors', async () => {
            const mockUsers = ['user1'];
            databaseService.getUsersInTimezone.mockResolvedValue(mockUsers);
            
            // Mock updateUserNicknamesForDST to throw an error
            jest.spyOn(dstService, 'updateUserNicknamesForDST').mockRejectedValue(new Error('Broadcast error'));

            await dstService.updateUsersForDSTChanges(['America/New_York']);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('❌ Error updating user user1 for DST:'),
                'Broadcast error'
            );
        });
    });

    describe('Full DST Check Process', () => {
        beforeEach(() => {
            // Reset the spies before each test
            dstService.checkTimezoneForDST.mockReset();
            dstService.updateUsersForDSTChanges.mockReset();
        });

        test('should check all active timezones', async () => {
            const mockTimezones = [
                { timezone_identifier: 'America/New_York' },
                { timezone_identifier: 'Europe/London' }
            ];
            
            databaseService.getStats.mockResolvedValue({
                popularTimezones: mockTimezones
            });

            dstService.checkTimezoneForDST.mockResolvedValue(false);

            await dstService.checkDSTChanges();

            expect(databaseService.getStats).toHaveBeenCalled();
            expect(dstService.checkTimezoneForDST).toHaveBeenCalledWith('America/New_York');
            expect(dstService.checkTimezoneForDST).toHaveBeenCalledWith('Europe/London');
        });

        test('should process DST changes when detected', async () => {
            const mockTimezones = [
                { timezone_identifier: 'America/New_York' },
                { timezone_identifier: 'Europe/London' }
            ];
            
            databaseService.getStats.mockResolvedValue({
                popularTimezones: mockTimezones
            });

            dstService.checkTimezoneForDST
                .mockResolvedValueOnce(true)  // America/New_York has DST change
                .mockResolvedValueOnce(false); // Europe/London has no change

            dstService.updateUsersForDSTChanges.mockResolvedValue(5);

            await dstService.checkDSTChanges();

            expect(dstService.updateUsersForDSTChanges).toHaveBeenCalledWith(['America/New_York']);
        });

        test('should handle no timezones gracefully', async () => {
            databaseService.getStats.mockResolvedValue({
                popularTimezones: []
            });

            await dstService.checkDSTChanges();

            expect(dstService.checkTimezoneForDST).not.toHaveBeenCalled();
        });

        test('should handle individual timezone errors', async () => {
            const mockTimezones = [
                { timezone_identifier: 'America/New_York' },
                { timezone_identifier: 'Invalid/Timezone' }
            ];
            
            databaseService.getStats.mockResolvedValue({
                popularTimezones: mockTimezones
            });

            dstService.checkTimezoneForDST
                .mockResolvedValueOnce(false)
                .mockRejectedValueOnce(new Error('Invalid timezone'));

            await dstService.checkDSTChanges();

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('❌ Error checking DST for Invalid/Timezone:'),
                'Invalid timezone'
            );
        });
    });

    describe('Timer Integration', () => {
        test('should call checkDSTChanges on interval', async () => {
            jest.useFakeTimers();
            const checkSpy = jest.spyOn(dstService, 'checkDSTChanges').mockResolvedValue();

            await dstService.start();
            
            // Advance to the next hour to trigger the first check
            jest.advanceTimersByTime(61 * 60 * 1000);
            
            // Should have been called once (first check at top of hour)
            expect(checkSpy).toHaveBeenCalledTimes(1);
            
            // Clear the call count from the initial check
            checkSpy.mockClear();
            
            // Fast-forward time by 1 more hour to trigger the interval
            jest.advanceTimersByTime(60 * 60 * 1000);

            // Should have been called once more (second hourly check)
            expect(checkSpy).toHaveBeenCalledTimes(1);

            // Clean up
            await dstService.stop();
            checkSpy.mockRestore();
            jest.useRealTimers();
        });

        test('should handle timer errors gracefully', async () => {
            jest.useFakeTimers();
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // Mock getStats to cause an error in checkDSTChanges
            databaseService.getStats.mockRejectedValue(new Error('Database error'));

            await dstService.start();
            
            // Fast-forward to trigger the first check (advance to next hour)
            // Since we can't predict exactly how long until next hour, advance by more than an hour
            jest.advanceTimersByTime(61 * 60 * 1000);

            // Wait a moment for async operations
            await Promise.resolve();

            // Check that error was logged (the error gets caught by the main catch block)
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '❌ DST check failed:',
                expect.any(Error)
            );

            // Clean up
            await dstService.stop();
            consoleErrorSpy.mockRestore();
            jest.useRealTimers();
        });
    });
});
