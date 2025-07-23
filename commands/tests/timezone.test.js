const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Mock all dependencies
jest.mock('../../services/databaseService');
jest.mock('../../services/timezoneService');
jest.mock('../../utils/logger');

const databaseService = require('../../services/databaseService');
const timezoneService = require('../../services/timezoneService');
const { logger } = require('../../utils/logger');

// Import the command under test
const timezoneCommand = require('../timezone');

describe('Timezone Command', () => {
    let mockInteraction;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock interaction
        mockInteraction = {
            options: {
                getSubcommand: jest.fn(),
                getString: jest.fn(),
                getUser: jest.fn()
            },
            user: {
                id: 'user123',
                tag: 'TestUser#1234',
                username: 'TestUser'
            },
            guild: {
                id: 'guild456',
                name: 'Test Guild',
                ownerId: 'owner789',
                members: {
                    fetch: jest.fn()
                }
            },
            member: {
                id: 'user123',
                nickname: null,
                user: {
                    id: 'user123',
                    username: 'TestUser'
                },
                setNickname: jest.fn(),
                manageable: true
            },
            reply: jest.fn(),
            editReply: jest.fn(),
            deferReply: jest.fn(),
            replied: false,
            deferred: false,
            respond: jest.fn()
        };

        // Mock service methods
        databaseService.setUserTimezone = jest.fn();
        databaseService.addUserToServer = jest.fn();
        databaseService.getUserTimezone = jest.fn();
        databaseService.clearUserData = jest.fn();
        databaseService.removeUserFromServer = jest.fn();
        timezoneService.isValidTimezone = jest.fn();
        timezoneService.formatNicknameWithTimezone = jest.fn();
        timezoneService.getCurrentOffset = jest.fn();
        timezoneService.searchTimezones = jest.fn();
        logger.log = jest.fn();
    });

    describe('Command Structure', () => {
        test('should have correct command data structure', () => {
            expect(timezoneCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(timezoneCommand.data.name).toBe('timezone');
            expect(timezoneCommand.data.description).toBe('Set your timezone for automatic nickname updates');
        });

        test('should have execute function', () => {
            expect(typeof timezoneCommand.execute).toBe('function');
        });

        test('should have autocomplete function', () => {
            expect(typeof timezoneCommand.autocomplete).toBe('function');
        });
    });

    describe('Autocomplete Functionality', () => {
        test('should return timezone suggestions', async () => {
            const mockChoices = [
                { name: 'America/New_York (Eastern Time)', value: 'America/New_York' },
                { name: 'America/Chicago (Central Time)', value: 'America/Chicago' }
            ];

            mockInteraction.options.getFocused = jest.fn().mockReturnValue('America');
            timezoneService.searchTimezones.mockReturnValue(mockChoices);

            await timezoneCommand.autocomplete(mockInteraction);

            expect(timezoneService.searchTimezones).toHaveBeenCalledWith('America');
            expect(mockInteraction.respond).toHaveBeenCalledWith(mockChoices);
        });

        test('should handle autocomplete errors gracefully', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockInteraction.options.getFocused = jest.fn().mockImplementation(() => {
                throw new Error('Autocomplete error');
            });

            await timezoneCommand.autocomplete(mockInteraction);

            expect(mockInteraction.respond).toHaveBeenCalledWith([]);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Set Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
            mockInteraction.options.getString.mockReturnValue('America/New_York');
            timezoneService.isValidTimezone.mockReturnValue(true);
            timezoneService.getCurrentOffset.mockReturnValue('UTC-5');
            timezoneService.formatNicknameWithTimezone.mockReturnValue('TestUser (UTC-5)');
            databaseService.setUserTimezone.mockResolvedValue(true);
            databaseService.addUserToServer.mockResolvedValue(true);
            mockInteraction.guild.members.fetch.mockResolvedValue(mockInteraction.member);
            mockInteraction.member.setNickname.mockResolvedValue();
        });

        test('should set timezone successfully for regular user', async () => {
            await timezoneCommand.execute(mockInteraction);

            expect(timezoneService.isValidTimezone).toHaveBeenCalledWith('America/New_York');
            expect(databaseService.setUserTimezone).toHaveBeenCalledWith('user123', 'America/New_York');
            expect(databaseService.addUserToServer).toHaveBeenCalledWith('user123', 'guild456');
            expect(mockInteraction.member.setNickname).toHaveBeenCalledWith('TestUser (UTC-5)');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Timezone Set Successfully'
                            })
                        })
                    ])
                })
            );
        });

        test('should handle server owner (cannot change nickname)', async () => {
            mockInteraction.guild.ownerId = 'user123'; // User is server owner

            await timezoneCommand.execute(mockInteraction);

            expect(databaseService.setUserTimezone).toHaveBeenCalledWith('user123', 'America/New_York');
            expect(mockInteraction.member.setNickname).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description: expect.stringContaining('server owner')
                            })
                        })
                    ])
                })
            );
        });

        test('should handle unmanageable member', async () => {
            mockInteraction.member.manageable = false;

            await timezoneCommand.execute(mockInteraction);

            expect(databaseService.setUserTimezone).toHaveBeenCalledWith('user123', 'America/New_York');
            expect(mockInteraction.member.setNickname).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description: expect.stringContaining('permissions')
                            })
                        })
                    ])
                })
            );
        });

        test('should handle invalid timezone', async () => {
            timezoneService.isValidTimezone.mockReturnValue(false);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Invalid Timezone'
                            })
                        })
                    ])
                })
            );
            expect(databaseService.setUserTimezone).not.toHaveBeenCalled();
        });

        test('should handle database errors', async () => {
            databaseService.setUserTimezone.mockResolvedValue(false);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Database Error'
                            })
                        })
                    ])
                })
            );
        });

        test('should handle nickname update errors', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            mockInteraction.member.setNickname.mockRejectedValue(new Error('Nickname error'));

            await timezoneCommand.execute(mockInteraction);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error updating nickname:',
                expect.any(Error)
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description: expect.stringContaining('nickname could not be updated')
                            })
                        })
                    ])
                })
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Clear Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('clear');
            databaseService.getUserTimezone.mockResolvedValue({
                user_id: 'user123',
                timezone_identifier: 'America/New_York'
            });
            databaseService.clearUserData.mockResolvedValue(true);
            databaseService.removeUserFromServer.mockResolvedValue(true);
            mockInteraction.guild.members.fetch.mockResolvedValue(mockInteraction.member);
            mockInteraction.member.setNickname.mockResolvedValue();
        });

        test('should clear user data successfully', async () => {
            await timezoneCommand.execute(mockInteraction);

            expect(databaseService.getUserTimezone).toHaveBeenCalledWith('user123');
            expect(databaseService.clearUserData).toHaveBeenCalledWith('user123');
            expect(databaseService.removeUserFromServer).toHaveBeenCalledWith('user123', 'guild456');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Data Cleared Successfully'
                            })
                        })
                    ])
                })
            );
        });

        test('should handle case where user has no timezone set', async () => {
            databaseService.getUserTimezone.mockResolvedValue(null);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ No Data Found'
                            })
                        })
                    ])
                })
            );
            expect(databaseService.clearUserData).not.toHaveBeenCalled();
        });

        test('should handle database errors during clear', async () => {
            databaseService.clearUserData.mockResolvedValue(false);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ Database Error'
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('Time Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('time');
            mockInteraction.options.getUser.mockReturnValue({
                id: 'target123',
                username: 'TargetUser',
                tag: 'TargetUser#5678'
            });
            databaseService.getUserTimezone.mockResolvedValue({
                user_id: 'target123',
                timezone_identifier: 'America/New_York'
            });
            timezoneService.getCurrentOffset.mockReturnValue('UTC-5');
        });

        test('should show time for target user', async () => {
            await timezoneCommand.execute(mockInteraction);

            expect(databaseService.getUserTimezone).toHaveBeenCalledWith('target123');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('🕐 Current Time')
                            })
                        })
                    ])
                })
            );
        });

        test('should show time for command user when no target specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            databaseService.getUserTimezone.mockResolvedValue({
                user_id: 'user123',
                timezone_identifier: 'Europe/London'
            });

            await timezoneCommand.execute(mockInteraction);

            expect(databaseService.getUserTimezone).toHaveBeenCalledWith('user123');
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('🕐 Current Time')
                            })
                        })
                    ])
                })
            );
        });

        test('should handle user with no timezone set', async () => {
            databaseService.getUserTimezone.mockResolvedValue(null);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '❌ No Timezone Set'
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle general execution errors', async () => {
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('General error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            await timezoneCommand.execute(mockInteraction);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Error executing timezone command:',
                expect.any(Error)
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('❌ An error occurred'),
                    flags: [MessageFlags.Ephemeral]
                })
            );

            consoleErrorSpy.mockRestore();
        });

        test('should handle reply errors gracefully', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('invalid');
            mockInteraction.reply.mockRejectedValue(new Error('Reply error'));

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            await timezoneCommand.execute(mockInteraction);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '❌ Failed to send timezone error reply:',
                expect.any(Error)
            );

            consoleErrorSpy.mockRestore();
        });

        test('should not reply if interaction already replied', async () => {
            mockInteraction.replied = true;
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('Test error');
            });

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.reply).not.toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Permission Handling', () => {
        test('should detect server owner correctly', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
            mockInteraction.options.getString.mockReturnValue('America/New_York');
            mockInteraction.guild.ownerId = 'user123'; // User is owner
            
            timezoneService.isValidTimezone.mockReturnValue(true);
            databaseService.setUserTimezone.mockResolvedValue(true);
            databaseService.addUserToServer.mockResolvedValue(true);

            await timezoneCommand.execute(mockInteraction);

            expect(mockInteraction.member.setNickname).not.toHaveBeenCalled();
        });

        test('should handle missing guild information', async () => {
            mockInteraction.guild = null;
            mockInteraction.options.getSubcommand.mockReturnValue('set');

            await timezoneCommand.execute(mockInteraction);

            // Should still work but skip nickname updates
            expect(mockInteraction.reply).toHaveBeenCalled();
        });
    });
});
