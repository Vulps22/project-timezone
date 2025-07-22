const fs = require('fs');
const path = require('path');

class EventLoader {
    constructor(client) {
        this.client = client;
        this.loadEvents();
    }

    /**
     * Load all event files
     */
    loadEvents() {
        const eventsPath = path.join(__dirname, '../events');
        
        if (!fs.existsSync(eventsPath)) {
            console.error('❌ Events directory not found');
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        
        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            
            try {
                const event = require(filePath);
                
                if (!event.name || !event.execute) {
                    console.warn(`⚠️ Event ${file} is missing required 'name' or 'execute' property`);
                    continue;
                }
                
                if (event.once) {
                    this.client.once(event.name, (...args) => event.execute(...args));
                } else {
                    this.client.on(event.name, (...args) => event.execute(...args));
                }
                
                console.log(`✅ Loaded event: ${event.name}`);
                
            } catch (error) {
                console.error(`❌ Error loading event ${file}:`, error);
            }
        }
    }

    /**
     * Reload a specific event
     * @param {string} eventName - Name of event file to reload
     * @returns {boolean} Success status
     */
    reloadEvent(eventName) {
        try {
            const eventsPath = path.join(__dirname, '../events');
            const eventFile = `${eventName}.js`;
            const filePath = path.join(eventsPath, eventFile);
            
            if (!fs.existsSync(filePath)) {
                console.error(`❌ Event file ${eventFile} not found`);
                return false;
            }
            
            // Remove all listeners for this event first
            const event = require(filePath);
            this.client.removeAllListeners(event.name);
            
            // Delete from require cache
            delete require.cache[require.resolve(filePath)];
            
            // Reload the event
            const newEvent = require(filePath);
            
            if (!newEvent.name || !newEvent.execute) {
                console.error(`❌ Event ${eventFile} is missing required properties`);
                return false;
            }
            
            if (newEvent.once) {
                this.client.once(newEvent.name, (...args) => newEvent.execute(...args));
            } else {
                this.client.on(newEvent.name, (...args) => newEvent.execute(...args));
            }
            
            console.log(`✅ Reloaded event: ${newEvent.name}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error reloading event ${eventName}:`, error);
            return false;
        }
    }
}

module.exports = EventLoader;
