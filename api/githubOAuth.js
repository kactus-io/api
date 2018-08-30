var https = require('https')
var qs = require('querystring')
var axios = require('axios')
const storage = require('../storage')()
const makeCallback = require('./_makeCallback')

function authenticate (code, cb) {
  var data = qs.stringify({
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code: code
  })

  var reqOptions = {
    host: process.env.GITHUB_HOST,
    port: process.env.GITHUB_PORT || 443,
    path: process.env.GITHUB_PATH,
    method: process.env.GITHUB_METHOD || 'POST',
    headers: { 'content-length': data.length }
  }

  var body = ''
  var req = https.request(reqOptions, (res) => {
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      body += chunk
    })
    res.on('end', () => {
      var token = qs.parse(body).access_token
      cb(!token && new Error('missing access token'), token)
    })
  })

  req.write(data)
  req.end()
  req.on('error', (e) => {
    cb(e.message)
  })
}

module.exports.handler = (event, context, callback) => {
  authenticate(event.queryStringParameters.code, function (err, token) {
    if (err) {
      console.log(err)
      makeCallback(callback, 'Bad Code', 400)
      return
    }
    axios({
      url: 'https://api.github.com/user',
      headers: {
        Authorization: 'Token ' + token,
        Accept: 'application/vnd.github.v3+json'
      }
    }).then(user => user.data)
      .then(user => {
        return storage.findOne(user.id).then(found => {
          if (found) {
            return found
          }
          const body = {
            githubId: '' + user.githubId,
            enterprise: false
          }
          if (user.email) {
            body.email = user.email.email || user.email
          }
          if (user.login) {
            body.login = user.login
          }
          return storage.create(body).then(() => body)
        })
      })
      .then(user => {
        return storage.findOrgs(user.orgs).then(orgs => {
          user.orgs = orgs || []
          return makeCallback(callback, {
            ok: true,
            user,
            token
          })
        })
      })
      .catch(err => makeCallback(callback, err.message, 500))
  })
}
