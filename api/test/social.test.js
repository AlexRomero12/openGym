/* Social del grupo: los posts validan la distribución muscular que publica el cliente
   (api/social.js). Viaja como series efectivas por músculo canónico; acá se comprueba que lo
   ajeno o inválido se descarta y que un post sin mapa (los anteriores a esta función) sigue
   leyéndose igual. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addPost, socialData } from '../social.js'

const base = { minutes: 50, volumeKg: 1200, sets: 12 }

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-social-'))
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'u1', name: 'Uno' }] }))
  fs.writeFileSync(path.join(dir, 'friends.json'), JSON.stringify({ participants: [{ uid: 'u1', name: 'Uno' }] }))
  fs.writeFileSync(path.join(dir, 'state-u1.json'), JSON.stringify({ workouts: [] }))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('addPost keeps canonical muscles and drops unknown, non-numeric and out-of-range values', t => {
  const post = addPost(fixture(t), 'u1', {
    ...base,
    muscles: { chest: 4, triceps: 1.6, 'not-a-muscle': 3, deltoids: 'x', biceps: 9999, abs: 0 },
  })
  assert.deepEqual(post.muscles, { chest: 4, triceps: 1.6, biceps: 300 })
})

test('socialData exposes the map and tolerates posts without it', t => {
  const dir = fixture(t)
  addPost(dir, 'u1', { ...base, muscles: { chest: 2 } })
  addPost(dir, 'u1', base)
  const feed = socialData(dir, 'u1')
  assert.equal(feed.posts.length, 2)
  assert.deepEqual(feed.posts.find(p => p.muscles).muscles, { chest: 2 })
  assert.equal(feed.posts.find(p => !p.muscles).muscles, null)
})
