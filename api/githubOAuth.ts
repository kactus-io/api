import * as qs from 'querystring'
import fetch from 'node-fetch'
import { findOne, findOrgs, User, create } from '../storage'
import { _handler } from '../_handler'
import { BadRequest } from './errors'

async function authenticate(
  code: String
): Promise<{
  access_token: string
  token_type: 'bearer'
  scope: string
}> {
  const res = await fetch(
    `https://github.com/login/oauth/access_token?${qs.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    })}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  const data = await res.json()

  if (!res.ok) {
    const error = new BadRequest(data.message)
    error.status = res.status
    throw error
  }

  return data
}

async function getEmail(access_token: string, scopes: string[], user: any) {
  // sometime the email is nested or not. It's weird.
  let email: string = (user.email && user.email.email) || user.email

  // let's check if we have access to the private emails of the user
  if (scopes.some(s => s === 'user:email')) {
    const privateEmailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: 'Token ' + access_token,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (privateEmailsRes.ok) {
      const privateEmails: {
        email: string
        verified: boolean
        primary: boolean
        visibility: 'public' | 'private'
      }[] = await privateEmailsRes.json()

      email = privateEmails.find(e => e.primary).email
    }
  }

  return email
}

export const handler = _handler(async event => {
  const { access_token, scope } = await authenticate(
    event.queryStringParameters.code
  )

  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: 'Token ' + access_token,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  const data = await res.json()

  if (!res.ok) {
    const error = new BadRequest(data.message)
    error.status = res.status
    throw error
  }

  const githubId = String(data.id)
  const existingUser = await findOne(githubId)

  let user: User
  if (existingUser) {
    user = existingUser
  } else {
    user = await create({
      githubId: githubId,
      email: await getEmail(access_token, scope.split(', '), data),
      login: data.login,
    })
  }

  const orgs = await findOrgs(user.orgs)

  return {
    ok: true,
    user: {
      ...user,
      orgs,
    },
    token: access_token,
  }
})
