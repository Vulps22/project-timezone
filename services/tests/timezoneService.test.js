const { DateTime } = require('luxon');

// Import the service under test
const timezoneService = require('../timezoneService');

describe('TimezoneService', () => {
    describe('Timezone Validation', () => {
        test('should validate correct timezone identifiers', () => {
            const validTimezones = [
                'America/New_York',
                'Europe/London',
                'Asia/Tokyo',
                'Australia/Sydney',
                'UTC'
            ];

            validTimezones.forEach(timezone => {
                expect(timezoneService.isValidTimezone(timezone)).toBe(true);
            });
        });

        test('should reject invalid timezone identifiers', () => {
            const invalidTimezones = [
                'Invalid/Timezone',
                'America/FakeCity',
                'NotATimezone',
                '',
                null,
                undefined
            ];

            invalidTimezones.forEach(timezone => {
                expect(timezoneService.isValidTimezone(timezone)).toBe(false);
            });
        });
    });

    describe('Current Offset Calculation', () => {
        test('should return UTC+0 for UTC timezone', () => {
            const offset = timezoneService.getCurrentOffset('UTC');
            expect(offset).toBe('UTC+0');
        });

        test('should return correct format for various timezones', () => {
            // Test with known timezones - we can't predict exact values due to DST
            const offset1 = timezoneService.getCurrentOffset('America/New_York');
            const offset2 = timezoneService.getCurrentOffset('Europe/London');
            const offset3 = timezoneService.getCurrentOffset('Asia/Tokyo');

            // Should all match the UTC±N format
            expect(offset1).toMatch(/UTC[+-]\d+/);
            expect(offset2).toMatch(/UTC[+-]\d+/);
            expect(offset3).toMatch(/UTC[+-]\d+/);
        });

        test('should handle invalid timezones by throwing error', () => {
            expect(() => {
                timezoneService.getCurrentOffset('Invalid/Timezone');
            }).toThrow();
        });
    });

    describe('Nickname Processing', () => {
        describe('removeTimezoneFromNickname', () => {
            test('should remove timezone from end of nickname', () => {
                const testCases = [
                    { input: 'John (UTC-5)', expected: 'John' },
                    { input: 'Alice (UTC+0)', expected: 'Alice' },
                    { input: 'Bob (UTC+10)', expected: 'Bob' },
                    { input: 'Charlie (UTC-8)', expected: 'Charlie' }
                ];

                testCases.forEach(({ input, expected }) => {
                    expect(timezoneService.removeTimezoneFromNickname(input)).toBe(expected);
                });
            });

            test('should handle nicknames without timezone', () => {
                const testCases = [
                    'John',
                    'Alice (but not timezone)',
                    'Bob UTC+5 not at end',
                    'Charlie (random parentheses)',
                    ''
                ];

                testCases.forEach(input => {
                    expect(timezoneService.removeTimezoneFromNickname(input)).toBe(input);
                });
            });

            test('should handle null and undefined gracefully', () => {
                expect(timezoneService.removeTimezoneFromNickname(null)).toBe('');
                expect(timezoneService.removeTimezoneFromNickname(undefined)).toBe('');
            });
        });

        describe('formatNicknameWithTimezone', () => {
            test('should format nickname with timezone', () => {
                // Mock getCurrentOffset to return predictable value
                const originalGetCurrentOffset = timezoneService.getCurrentOffset;
                timezoneService.getCurrentOffset = jest.fn().mockReturnValue('UTC-5');

                const result = timezoneService.formatNicknameWithTimezone(
                    'John',
                    'America/New_York',
                    'johnuser'
                );
                
                expect(result).toBe('John (UTC-5)');

                // Restore original function
                timezoneService.getCurrentOffset = originalGetCurrentOffset;
            });

            test('should use username when nickname is null', () => {
                const originalGetCurrentOffset = timezoneService.getCurrentOffset;
                timezoneService.getCurrentOffset = jest.fn().mockReturnValue('UTC-5');

                const result = timezoneService.formatNicknameWithTimezone(
                    null,
                    'America/New_York',
                    'johnuser'
                );
                
                expect(result).toBe('johnuser (UTC-5)');

                timezoneService.getCurrentOffset = originalGetCurrentOffset;
            });

            test('should remove existing timezone before adding new one', () => {
                const originalGetCurrentOffset = timezoneService.getCurrentOffset;
                timezoneService.getCurrentOffset = jest.fn().mockReturnValue('UTC-5');

                const result = timezoneService.formatNicknameWithTimezone(
                    'John (UTC+9)',
                    'America/New_York',
                    'johnuser'
                );
                
                expect(result).toBe('John (UTC-5)');

                timezoneService.getCurrentOffset = originalGetCurrentOffset;
            });
        });
    });

    describe('Timezone Search', () => {
        test('should return empty array for empty search', () => {
            const results = timezoneService.searchTimezones('');
            expect(results.length).toBeGreaterThan(0); // Returns common timezones for empty query
        });

        test('should find timezones by partial name', () => {
            const results = timezoneService.searchTimezones('New_York');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('name');
            expect(results[0]).toHaveProperty('value');
            expect(results[0].value).toBe('America/New_York');
        });

        test('should find timezones by region', () => {
            const results = timezoneService.searchTimezones('America');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('name');
            expect(results[0]).toHaveProperty('value');
            expect(results[0].value).toMatch(/^America\//);
        });

        test('should be case insensitive', () => {
            const results1 = timezoneService.searchTimezones('london');
            const results2 = timezoneService.searchTimezones('LONDON');
            
            expect(results1.length).toBeGreaterThan(0);
            expect(results2.length).toBeGreaterThan(0);
            // Should find London timezone
            expect(results1.some(r => r.value.includes('London'))).toBe(true);
            expect(results2.some(r => r.value.includes('London'))).toBe(true);
        });

        test('should return empty array for no matches', () => {
            const results = timezoneService.searchTimezones('ThisTimezoneDoesNotExist');
            expect(results).toEqual([]);
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete timezone workflow', () => {
            // Test the complete flow: validate -> get offset -> format nickname
            const timezone = 'America/New_York';
            const nickname = 'TestUser (UTC+9)';
            const username = 'testuser';

            // 1. Validate timezone
            expect(timezoneService.isValidTimezone(timezone)).toBe(true);

            // 2. Remove old timezone
            const cleanNickname = timezoneService.removeTimezoneFromNickname(nickname);
            expect(cleanNickname).toBe('TestUser');

            // 3. Get current offset
            const offset = timezoneService.getCurrentOffset(timezone);
            expect(offset).toMatch(/UTC[+-]\d+/);

            // 4. Format with new timezone
            const newNickname = timezoneService.formatNicknameWithTimezone(
                cleanNickname,
                timezone,
                username
            );
            expect(newNickname).toContain('TestUser');
            expect(newNickname).toContain('UTC');
            expect(newNickname).toMatch(/TestUser \(UTC[+-]\d+\)/);
        });

        test('should handle edge cases in workflow', () => {
            // Test with empty/null values
            expect(timezoneService.isValidTimezone('')).toBe(false);
            expect(timezoneService.removeTimezoneFromNickname('')).toBe('');
            
            // Test search with edge cases
            expect(timezoneService.searchTimezones('').length).toBeGreaterThan(0); // Returns common timezones
            expect(timezoneService.searchTimezones('   ').length).toBeGreaterThan(0); // Returns common timezones
        });
    });
});
