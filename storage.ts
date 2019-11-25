import * as AWS from 'aws-sdk'

/* USERS */
export type User = {
  githubId: string
  email: string
  login: string
  stripeId?: string
  valid: boolean
  validEnterprise: boolean
  createdAt: number
  lastSeenAt: number
  orgs: string[]
}

/* ORGS */
export type Org = {
  id: string
  admins: string[]
  members: string[]
  stripeId?: string
  valid: boolean
  validEnterprise: boolean
  createdAt: number
}

const db = new AWS.DynamoDB.DocumentClient()

export const findOne = async (githubId: string): Promise<User | void> => {
  if (!githubId) {
    return undefined
  }
  const meta = await db
    .get({
      TableName: process.env.USERS_TABLE_NAME,
      Key: {
        githubId: String(githubId),
      },
    })
    .promise()
  // @ts-ignore
  return (meta || {}).Item
}

export const findOneByName = async (
  githubUsername: string
): Promise<Pick<User, 'githubId' | 'login'> | void> => {
  if (!githubUsername) {
    return undefined
  }

  const meta = await db
    .query({
      TableName: process.env.USERS_TABLE_NAME,
      IndexName: 'indexByLogin',
      ProjectionExpression: 'githubId, login',
      KeyConditionExpression: 'login = :githubUsername',
      ExpressionAttributeValues: {
        ':githubUsername': String(githubUsername),
      },
    })
    .promise()
  // @ts-ignore
  return ((meta || {}).Items || [])[0]
}

export const update = async (data: User, body?: Partial<User>) => {
  data.lastSeenAt = Date.now()
  if (body) {
    data = Object.assign(data, body)
  }
  await db
    .put({
      TableName: process.env.USERS_TABLE_NAME,
      Item: data,
    })
    .promise()
  return data
}

export const create = async (
  data: Pick<User, 'githubId' | 'email' | 'login'>
) => {
  // @ts-ignore
  delete data.enterprise
  const user: User = {
    valid: false,
    validEnterprise: false,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    orgs: [],
    ...data,
  }
  await db
    .put({
      TableName: process.env.USERS_TABLE_NAME,
      Item: user,
    })
    .promise()
  return user
}

export const findOneOrg = async (id: string): Promise<Org | void> => {
  if (!id) {
    return undefined
  }
  const meta = await db
    .get({
      TableName: process.env.ORGS_TABLE_NAME,
      Key: {
        id: String(id),
      },
    })
    .promise()
  // @ts-ignore
  return (meta || {}).Item
}

export const findOrgs = async (
  ids: string[]
): Promise<
  Pick<
    Org,
    'id' | 'members' | 'admins' | 'stripeId' | 'valid' | 'validEnterprise'
  >[]
> => {
  if (!ids || !ids.length) {
    return []
  }
  return Promise.all(
    ids.map(id =>
      db
        .get({
          TableName: process.env.ORGS_TABLE_NAME,
          ProjectionExpression:
            'id, members, admins, stripeId, valid, validEnterprise',
          Key: {
            id: String(id),
          },
        })
        .promise()
        .then(meta => (meta || {}).Item as Org)
    )
  ).then(x => x.filter(y => !!y))
}

export const addUserToOrg = async (org: Org, user: User) => {
  org.members = (org.members || []).concat(String(user.githubId))
  user.orgs = (user.orgs || []).concat(String(org.id))
  await Promise.all([
    db
      .put({
        TableName: process.env.USERS_TABLE_NAME,
        Item: user,
      })
      .promise(),
    db
      .put({
        TableName: process.env.ORGS_TABLE_NAME,
        Item: org,
      })
      .promise(),
  ])

  return org
}

export const removeUserFromOrg = async (org: Org, user: User) => {
  org.members = (org.members || []).filter(u => u !== String(user.githubId))
  user.orgs = (user.orgs || []).filter(o => o !== String(org.id))
  await Promise.all([
    db
      .put({
        TableName: process.env.USERS_TABLE_NAME,
        Item: user,
      })
      .promise(),
    db
      .put({
        TableName: process.env.ORGS_TABLE_NAME,
        Item: org,
      })
      .promise(),
  ])

  return org
}

export const createOrg = async (
  data: Pick<Org, 'id' | 'admins' | 'members'>
) => {
  // @ts-ignore
  delete data.enterprise
  const org: Org = {
    createdAt: Date.now(),
    valid: false,
    validEnterprise: false,
    ...data,
  }
  await db
    .put({
      TableName: process.env.ORGS_TABLE_NAME,
      Item: org,
    })
    .promise()
  return org
}

export const updateOrg = async (data: Org, body?: Partial<User>) => {
  if (body) {
    data = Object.assign(data, body)
  }
  await db
    .put({
      TableName: process.env.ORGS_TABLE_NAME,
      Item: data,
    })
    .promise()
  return data
}
