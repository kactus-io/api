import * as https from 'https'
import * as qs from 'querystring'
import axios from 'axios'
import { findOne, findOrgs, User, create } from '../storage'
import { _handler } from '../_handler'
import { BadRequest } from './errors'

function authenticate(code: String) {
  return new Promise((resolve, reject) => {
    try {
      var data = qs.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      })

      var reqOptions = {
        host: process.env.GITHUB_HOST,
        port: process.env.GITHUB_PORT || 443,
        path: process.env.GITHUB_PATH,
        method: process.env.GITHUB_METHOD || 'POST',
        headers: { 'content-length': data.length },
      }

      var body = ''
      var req = https.request(reqOptions, res => {
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          var token = qs.parse(body).access_token
          if (!token) {
            reject(new BadRequest('missing access token'))
          } else {
            resolve(token)
          }
        })
      })

      req.write(data)
      req.end()
      req.on('error', e => {
        reject(e)
      })
    } catch (err) {
      reject(err)
    }
  })
}

export const handler = _handler(async event => {
  const token = await authenticate(event.queryStringParameters.code)

  const res = await axios({
    url: 'https://api.github.com/user',
    headers: {
      Authorization: 'Token ' + token,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  const githubUser = res.data
  const existingUser = await findOne(githubUser.id)

  let user: User
  if (existingUser) {
    user = existingUser
  } else {
    user = await create({
      githubId: '' + githubUser.id,
      email: githubUser.email.email || githubUser.email,
      login: githubUser.login,
    })
  }

  const orgs = await findOrgs(user.orgs)

  return {
    ok: true,
    user: {
      ...user,
      orgs,
    },
    token,
  }
})
