class ClientProvider {
    constructor() {
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    getClient() {
        if (!this.client) {
            throw new Error('Discord client has not been set. Call setClient() first.');
        }
        return this.client;
    }

    hasClient() {
        return this.client !== null;
    }
}

const clientProvider = new ClientProvider();

module.exports = {
    clientProvider
};
