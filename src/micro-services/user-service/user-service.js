/* [BIG TODO] user account creation, update, delete
- need good security, rate limiting, CAPTCHAs, etc.
- MAC? challenge response?

basic implementation should allow multiple datasource adapters
a source can be an API, database, file, etc.

The source will just need to be configured to create, update, delete users,
  which will be part of the required arguments for a custom userService adapter

  // user service create should also implicitly require auth service creation
  // auth service can be configured to use the user service (read-only)
  // need to determine how to ensure a password check works with read/create
  // could have some runtime fn or template? or a shared crypto service?
  

*/

// default user services use an in-memory datasource
// prod should warn to use an actual backend
// create PostgreSQL adapter for user service
// create MongoDB adapter for user service
// create Redis adapter for user service

// user and auth should use shared encryptPassword fn?
// adapters do not necessarily need to perform encryption
// the user service will not allow password decryption, only verification and update

// encryptPassword fn will default to use scrypt (TODO, implement in crypto library)
export async function createUserService({
  serviceName = 'user-service',
  useCustomDataSource = false
}) {
  let createUser, readUser, updateUser, deleteUser, encryptPassword
  if (useCustomDataSource) {
    createUser = useCustomDataSource.create
    readUser = useCustomDataSource.read
    updateUser = useCustomDataSource.update
    deleteUser = useCustomDataSource.delete

    // TODO
  } else {
    let cache = createInMemoryCache()
    createUser = (user) => {
      cache.set(user.id, user)
    }
    readUser = (id) => {
      return cache.get(id)
    }
    updateUser = (user) => {
      cache.set(user.id, user)
    }
    deleteUser = (id) => {
      cache.del(id)
    }
  }
}