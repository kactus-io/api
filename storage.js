const AWS = require('aws-sdk')

/* USERS
{
  githubId: String,
  email: String,
  login: String,
  stripeId: String,
  valid: Boolean,
  validEnterprise: Boolean,
  createdAt: Date,
  lastSeenAt: Date,
  orgs: [String]
}
*/

/* ORGS
{
  id: String,
  admins: [String],
  members: [String],
  stripeId: String,
  valid: Boolean,
  validEnterprise: Boolean,
  createdAt: Date
}
*/

module.exports = function Storage () {
  const db = new AWS.DynamoDB.DocumentClient()

  return {
    findOne (githubId) {
      if (!githubId) {
        return Promise.return(undefined)
      }
      return db
        .get({
          TableName: process.env.USERS_TABLE_NAME,
          Key: {
            githubId: String(githubId)
          }
        })
        .promise()
        .then(meta => (meta || {}).Item)
    },

    findOneByName (githubUsername) {
      if (!githubUsername) {
        return Promise.return(undefined)
      }
      return db
        .scan({
          TableName: process.env.USERS_TABLE_NAME,
          ProjectionExpression: 'githubId, login',
          FilterExpression: 'login = :githubUsername',
          ExpressionAttributeValues: {
            ':githubUsername': String(githubUsername)
          }
        })
        .promise()
        .then(meta => {
          return ((meta || {}).Items || [])[0]
        })
    },

    update (data) {
      data.lastSeenAt = Date.now()
      return db
        .put({
          TableName: process.env.USERS_TABLE_NAME,
          Item: data
        })
        .promise()
    },

    create (data) {
      data.createdAt = Date.now()
      data.lastSeenAt = Date.now()
      return db
        .put({
          TableName: process.env.USERS_TABLE_NAME,
          Item: data
        })
        .promise()
    },

    findOneOrg (id) {
      if (!id) {
        return Promise.return(undefined)
      }
      return db
        .get({
          TableName: process.env.ORGS_TABLE_NAME,
          Key: {
            id: String(id)
          }
        })
        .promise()
        .then(meta => (meta || {}).Item)
    },

    findOrgs (ids) {
      if (!ids || !ids.length) {
        return Promise.resolve([])
      }
      return db
        .scan({
          TableName: process.env.ORGS_TABLE_NAME,
          ProjectionExpression: 'id, members, admins, stripeId, valid, validEnterprise',
          FilterExpression: ids.reduce((prev, id, i) => {
            if (i > 0) {
              prev += ' OR '
            }
            return prev + 'id = :id' + i
          }, ''),
          ExpressionAttributeValues: ids.reduce((prev, id, i) => {
            prev[':id' + i] = String(id)
            return prev
          }, {})
        })
        .promise()
        .then(meta => {
          console.log(meta)
          return (meta || {}).Items || []
        })
    },

    addUserToOrg (org, user) {
      org.members = (org.members || []).concat(String(user.githubId))
      user.orgs = (user.orgs || []).concat(String(org.id))
      return Promise.all([
        db
          .put({
            TableName: process.env.USERS_TABLE_NAME,
            Item: user
          })
          .promise(),
        db
          .put({
            TableName: process.env.ORGS_TABLE_NAME,
            Item: org
          })
          .promise()
      ])
    },

    removeUserFromOrg (org, user) {
      org.members = (org.members || []).filter(u => u !== String(user.githubId))
      user.orgs = (user.orgs || []).filter(o => o !== String(org.id))
      return Promise.all([
        db
          .put({
            TableName: process.env.USERS_TABLE_NAME,
            Item: user
          })
          .promise(),
        db
          .put({
            TableName: process.env.ORGS_TABLE_NAME,
            Item: org
          })
          .promise()
      ])
    },

    createOrg (data) {
      data.createdAt = Date.now()
      return db
        .put({
          TableName: process.env.ORGS_TABLE_NAME,
          Item: data
        })
        .promise()
    },

    updateOrg (data) {
      return db
        .put({
          TableName: process.env.ORGS_TABLE_NAME,
          Item: data
        })
        .promise()
    }
  }
}
