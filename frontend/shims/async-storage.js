const store = new Map()

const AsyncStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  async setItem(key, value) {
    store.set(key, String(value))
  },
  async removeItem(key) {
    store.delete(key)
  },
  async clear() {
    store.clear()
  },
}

module.exports = AsyncStorage
module.exports.default = AsyncStorage
