export class BadRequest extends Error {
  status = 400
  data = null
}

export class NotFound extends Error {
  status = 404
  data = null
}

export class Unauthorized extends Error {
  status = 401
  data = null
}

export class Forbidden extends Error {
  status = 403
  data = null
}
