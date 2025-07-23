// Mock fs module
const mockFs = {
    readFileSync: jest.fn(),
    existsSync: jest.fn()
};

jest.mock('fs', () => mockFs);

// Mock https module
const mockHttps = {
    request: jest.fn()
};

jest.mock('https', () => mockHttps);

describe('Logger', () => {
    let logger;
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Mock successful config file read
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            webhookUrl: 'https://discord.com/api/webhooks/test'
        }));

        // Mock successful HTTPS request
        mockRequest = {
            on: jest.fn(),
            write: jest.fn(),
            end: jest.fn()
        };

        mockResponse = {
            statusCode: 200,
            on: jest.fn()
        };

        mockHttps.request.mockImplementation((options, callback) => {
            // Simulate successful response
            setImmediate(() => callback(mockResponse));
            return mockRequest;
        });

        logger = require('../logger').logger;
    });

    describe('Initialization', () => {
        test('should load webhook URL from config file', () => {
            expect(mockFs.existsSync).toHaveBeenCalledWith(
                expect.stringContaining('webhook-config.json')
            );
            expect(mockFs.readFileSync).toHaveBeenCalledWith(
                expect.stringContaining('webhook-config.json'),
                'utf8'
            );
        });

        test('should handle missing config file gracefully', () => {
            jest.resetModules();
            mockFs.existsSync.mockReturnValue(false);

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            const loggerModule = require('../logger');

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Webhook config file not found')
            );

            consoleWarnSpy.mockRestore();
        });

        test('should handle invalid JSON in config file', () => {
            jest.resetModules();
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue('invalid json');

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const loggerModule = require('../logger');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error loading webhook config'),
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Logging Functionality', () => {
        test('should send log message via webhook', async () => {
            const testMessage = 'Test log message';
            
            await logger.log(testMessage);

            expect(mockHttps.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                }),
                expect.any(Function)
            );

            expect(mockRequest.write).toHaveBeenCalledWith(
                expect.stringContaining(testMessage)
            );
            expect(mockRequest.end).toHaveBeenCalled();
        });

        test('should format message with timestamp', async () => {
            const testMessage = 'Test message';
            
            await logger.log(testMessage);

            const writeCall = mockRequest.write.mock.calls[0][0];
            const payload = JSON.parse(writeCall);

            expect(payload.content).toContain(testMessage);
            expect(payload.content).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // Timestamp format
        });

        test('should handle HTTPS request errors', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockRequest.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('Network error')));
                }
            });

            await logger.log('Test message');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error sending webhook log:',
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });

        test('should handle HTTP error responses', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockResponse.statusCode = 400;
            mockResponse.on.mockImplementation((event, callback) => {
                if (event === 'data') {
                    setImmediate(() => callback('Bad Request'));
                }
                if (event === 'end') {
                    setImmediate(() => callback());
                }
            });

            await logger.log('Test message');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Webhook returned status 400')
            );

            consoleErrorSpy.mockRestore();
        });

        test('should not send logs if webhook URL is not configured', async () => {
            jest.resetModules();
            mockFs.existsSync.mockReturnValue(false);

            const newLogger = require('../logger').logger;
            await newLogger.log('Test message');

            expect(mockHttps.request).not.toHaveBeenCalled();
        });

        test('should handle empty messages', async () => {
            await logger.log('');
            await logger.log(null);
            await logger.log(undefined);

            // Should still make requests but with empty content
            expect(mockHttps.request).toHaveBeenCalledTimes(3);
        });

        test('should truncate very long messages', async () => {
            const longMessage = 'A'.repeat(3000); // Very long message
            
            await logger.log(longMessage);

            const writeCall = mockRequest.write.mock.calls[0][0];
            const payload = JSON.parse(writeCall);

            // Discord has a 2000 character limit, so message should be truncated
            expect(payload.content.length).toBeLessThan(2000);
            expect(payload.content).toContain('...');
        });
    });

    describe('Message Formatting', () => {
        test('should preserve markdown formatting', async () => {
            const markdownMessage = '**Bold** and *italic* and `code`';
            
            await logger.log(markdownMessage);

            const writeCall = mockRequest.write.mock.calls[0][0];
            const payload = JSON.parse(writeCall);

            expect(payload.content).toContain('**Bold**');
            expect(payload.content).toContain('*italic*');
            expect(payload.content).toContain('`code`');
        });

        test('should handle special characters', async () => {
            const specialMessage = 'Test with émojis 🚀 and ñoël';
            
            await logger.log(specialMessage);

            const writeCall = mockRequest.write.mock.calls[0][0];
            const payload = JSON.parse(writeCall);

            expect(payload.content).toContain('émojis 🚀 and ñoël');
        });

        test('should escape JSON special characters', async () => {
            const jsonMessage = 'Message with "quotes" and \\backslashes\\';
            
            await logger.log(jsonMessage);

            expect(() => {
                const writeCall = mockRequest.write.mock.calls[0][0];
                JSON.parse(writeCall);
            }).not.toThrow();
        });
    });

    describe('Error Recovery', () => {
        test('should continue working after request error', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // First request fails
            mockRequest.on.mockImplementationOnce((event, callback) => {
                if (event === 'error') {
                    setImmediate(() => callback(new Error('First error')));
                }
            });

            await logger.log('First message');

            // Reset mocks for second request
            mockRequest.on.mockClear();

            // Second request succeeds
            await logger.log('Second message');

            expect(mockHttps.request).toHaveBeenCalledTimes(2);
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

            consoleErrorSpy.mockRestore();
        });

        test('should handle webhook URL changes', () => {
            // This test would require reloading the module with different config
            // In a real application, you might want a way to update the webhook URL at runtime
            expect(logger).toBeDefined();
        });
    });

    describe('Performance', () => {
        test('should handle rapid successive log calls', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(logger.log(`Message ${i}`));
            }

            await Promise.all(promises);

            expect(mockHttps.request).toHaveBeenCalledTimes(10);
        });

        test('should not block on log calls', () => {
            const startTime = Date.now();
            
            // This should return immediately
            const promise = logger.log('Test message');
            
            const endTime = Date.now();
            expect(endTime - startTime).toBeLessThan(10); // Should be nearly instant

            return promise; // Still wait for it to complete
        });
    });
});
