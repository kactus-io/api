const storage = require('../storage')()

module.exports.handler = (event, context, callback) => {
  storage
    .findOne(event.githubId)
    .then(item => {
      if (!item) {
        callback(new Error('[404] Not found'))
        return
      }
      callback(null, item)
    })
    .catch(callback)
}
