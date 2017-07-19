const AWS = require('aws-sdk')

/* USERS
{
  githubId: String,
  email: String,
  login: String,
  stripeId: String,
  valid: Boolean,
  createdAt: Date,
  lastSeenAt: Date
}
*/

module.exports = function Storage () {
  const db = new AWS.DynamoDB.DocumentClient()

  return {
    findOne (githubId) {
      return db
        .get({
          TableName: process.env.TABLE_NAME,
          Key: {
            githubId: githubId
          }
        })
        .promise()
        .then(meta => (meta || {}).Item)
    },

    update (data) {
      data.lastSeenAt = Date.now()
      return db
        .put({
          TableName: process.env.TABLE_NAME,
          Item: data
        })
        .promise()
    },

    create (data) {
      data.createdAt = Date.now()
      data.lastSeenAt = Date.now()
      return db
        .put({
          TableName: process.env.TABLE_NAME,
          Item: data
        })
        .promise()
    }
  }
}
