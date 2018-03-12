const { exec } = require('./child-process.js')

async function main() {
  let stdout = await exec('git status')
  console.log('git status', stdout)
  await exec('git add --all')
  console.log('git add', stdout)
  await exec('git commit -m "Add exec util"')
  console.log('git commit', stdout)
}
main()
.catch(err => {
  console.log(err.message)
})
