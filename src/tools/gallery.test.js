import { describe, expect, test, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import { createGalleryTools } from './gallery.js'
import { createFakeClient } from '../helpers/fakeClient.js'

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() }
}))

function setup () {
  const client = createFakeClient()
  const [manageGallery] = createGalleryTools({ client })
  return { client, manageGallery }
}

function mockFetch (impl) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

function imageResponse ({ ok = true, status = 200, contentType = 'image/png', bytes = 'img-bytes' } = {}) {
  return {
    ok,
    status,
    headers: { get: header => (header === 'content-type' ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(bytes).buffer
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  fs.readFile.mockReset()
})

describe('manage_gallery', () => {
  test('list_folders reports no folders here when the API sends no galleryName (pre-deploy fallback)', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageGallery.handler({ action: 'list_folders' })

    expect(client.get).toHaveBeenCalledWith('/gallery/folders', { parentFolderId: undefined, limit: 30 })
    expect(result.content[0].text).toBe('No folder(s) here.')
  })

  test('list_folders summarizes folders, flagging top-level ones and noting when more exist', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({
      count: 3,
      items: [
        { _id: 'f1', name: 'Logos', parentFolderId: null },
        { _id: 'f2', name: 'Old logos', parentFolderId: 'f1' }
      ]
    })

    const result = await manageGallery.handler({ action: 'list_folders', parentFolderId: 'f1' })

    expect(client.get).toHaveBeenCalledWith('/gallery/folders', { parentFolderId: 'f1', limit: 30 })
    expect(result.content[0].text).toBe('3 folder(s):\n"Logos" (id f1) - top level\n"Old logos" (id f2)\n(more not shown)')
  })

  test('list_folders at the top level lists the project folder itself as the first entry', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({
      count: 1,
      galleryName: 'Acme',
      items: [{ _id: 'f1', name: 'Logos', parentFolderId: null }]
    })

    const result = await manageGallery.handler({ action: 'list_folders' })

    expect(client.get).toHaveBeenCalledWith('/gallery/folders', { parentFolderId: undefined, limit: 30 })
    expect(result.content[0].text).toBe('2 folder(s):\n"Acme" - the project folder itself, i.e. this top level (target it by omitting parentFolderId; it can\'t be renamed or deleted)\n"Logos" (id f1) - top level')
  })

  test('list_folders at the top level with nothing else still lists the project folder', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({ count: 0, galleryName: 'Acme', items: [] })

    const result = await manageGallery.handler({ action: 'list_folders' })

    expect(result.content[0].text).toBe('1 folder(s):\n"Acme" - the project folder itself, i.e. this top level (target it by omitting parentFolderId; it can\'t be renamed or deleted)')
  })

  test('list_folders at the top level notes when more folders exist than were returned', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({
      count: 3,
      galleryName: 'Acme',
      items: [
        { _id: 'f1', name: 'Logos', parentFolderId: null },
        { _id: 'f2', name: 'Assets', parentFolderId: null }
      ]
    })

    const result = await manageGallery.handler({ action: 'list_folders' })

    expect(result.content[0].text).toBe('4 folder(s):\n"Acme" - the project folder itself, i.e. this top level (target it by omitting parentFolderId; it can\'t be renamed or deleted)\n"Logos" (id f1) - top level\n"Assets" (id f2) - top level\n(more not shown)')
  })

  test('list_folders inside a subfolder does not add the gallery header even when galleryName is present', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({
      count: 1,
      galleryName: 'Acme',
      items: [{ _id: 'f2', name: 'Old logos', parentFolderId: 'f1' }]
    })

    const result = await manageGallery.handler({ action: 'list_folders', parentFolderId: 'f1' })

    expect(result.content[0].text).toBe('1 folder(s):\n"Old logos" (id f2)')
  })

  test('list_images at the top level prefixes the gallery header', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({
      count: 1,
      galleryName: 'Acme',
      items: [{ _id: 'i1', name: 'logo.png', url: 'https://cdn.example.com/logo.png' }]
    })

    const result = await manageGallery.handler({ action: 'list_images' })

    expect(result.content[0].text).toBe('Project folder: "Acme"\n1 image(s):\n"logo.png" (id i1) - https://cdn.example.com/logo.png')
  })

  test('create_folder creates at the given parent and reports the result', async () => {
    const { client, manageGallery } = setup()
    client.post.mockResolvedValue({ _id: 'f2', name: 'Old logos', parentFolderId: 'f1' })

    const result = await manageGallery.handler({ action: 'create_folder', name: 'Old logos', parentFolderId: 'f1' })

    expect(client.post).toHaveBeenCalledWith('/gallery/folders', { name: 'Old logos', parentFolderId: 'f1' })
    expect(result.content[0].text).toBe('Created folder "Old logos" (id f2).')
  })

  test('rename_folder requires a folderId', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'rename_folder', name: 'New name' }))
      .rejects.toThrow('folderId is required.')
  })

  test('rename_folder patches the name and reports the result', async () => {
    const { client, manageGallery } = setup()
    client.patch.mockResolvedValue({ _id: 'f1', name: 'New name', parentFolderId: null })

    const result = await manageGallery.handler({ action: 'rename_folder', folderId: 'f1', name: 'New name' })

    expect(client.patch).toHaveBeenCalledWith('/gallery/folders/f1', { name: 'New name' })
    expect(result.content[0].text).toBe('Renamed folder to "New name" (id f1) - top level.')
  })

  test('delete_folder requires a folderId', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'delete_folder' }))
      .rejects.toThrow('folderId is required.')
  })

  test('delete_folder deletes by id', async () => {
    const { client, manageGallery } = setup()
    client.del.mockResolvedValue({})

    const result = await manageGallery.handler({ action: 'delete_folder', folderId: 'f1' })

    expect(client.del).toHaveBeenCalledWith('/gallery/folders/f1')
    expect(result.content[0].text).toBe('Deleted the folder, along with everything nested inside it.')
  })

  test('list_images reports no images here', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageGallery.handler({ action: 'list_images' })

    expect(client.get).toHaveBeenCalledWith('/gallery/images', { parentFolderId: undefined, limit: 30 })
    expect(result.content[0].text).toBe('No image(s) here.')
  })

  test('list_images summarizes images with their urls', async () => {
    const { client, manageGallery } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ _id: 'i1', name: 'logo.png', url: 'https://cdn.example.com/logo.png' }] })

    const result = await manageGallery.handler({ action: 'list_images' })

    expect(result.content[0].text).toBe('1 image(s):\n"logo.png" (id i1) - https://cdn.example.com/logo.png')
  })

  test('upload_image requires exactly one image source', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image' }))
      .rejects.toThrow('Provide exactly one of imageUrl, imagePath, or imageBase64.')
    await expect(manageGallery.handler({ action: 'upload_image', imageUrl: 'https://x/a.png', imagePath: '/a.png' }))
      .rejects.toThrow('Provide exactly one of imageUrl, imagePath, or imageBase64.')
  })

  test('upload_image fetches an imageUrl and uploads the bytes, taking the type and name from the URL path', async () => {
    const { client, manageGallery } = setup()
    const fetchFn = mockFetch(async () => imageResponse({ contentType: 'application/octet-stream', bytes: 'png-data' }))
    client.postForm.mockResolvedValue({ _id: 'i1', name: 'logo.png', url: 'https://cdn.example.com/logo.png' })

    const result = await manageGallery.handler({ action: 'upload_image', imageUrl: 'https://example.com/assets/logo.PNG?v=2', parentFolderId: 'f1' })

    expect(fetchFn).toHaveBeenCalledWith('https://example.com/assets/logo.PNG?v=2')
    expect(client.postForm).toHaveBeenCalledWith('/gallery/images', {
      fields: { name: undefined, parentFolderId: 'f1' },
      file: { fieldName: 'image', buffer: Buffer.from('png-data'), filename: 'logo.PNG', contentType: 'image/png' }
    })
    expect(result.content[0].text).toBe('Uploaded image "logo.png" (id i1) - https://cdn.example.com/logo.png.')
  })

  test('upload_image falls back to the response content-type and a generated filename when the URL has no extension', async () => {
    const { client, manageGallery } = setup()
    mockFetch(async () => imageResponse({ contentType: 'image/gif; charset=binary', bytes: 'gif-data' }))
    client.postForm.mockResolvedValue({ _id: 'i2', name: 'image.gif', url: 'https://cdn.example.com/image.gif' })

    await manageGallery.handler({ action: 'upload_image', imageUrl: 'https://example.com/download' })

    expect(client.postForm).toHaveBeenCalledWith('/gallery/images', {
      fields: { name: undefined, parentFolderId: undefined },
      file: { fieldName: 'image', buffer: Buffer.from('gif-data'), filename: 'download', contentType: 'image/gif' }
    })
  })

  test('upload_image generates image.<ext> when the URL path has no basename at all', async () => {
    const { client, manageGallery } = setup()
    mockFetch(async () => imageResponse({ contentType: 'image/jpeg' }))
    client.postForm.mockResolvedValue({ _id: 'i3', name: 'image.jpg', url: 'https://cdn.example.com/image.jpg' })

    await manageGallery.handler({ action: 'upload_image', imageUrl: 'https://example.com/' })

    expect(client.postForm.mock.calls[0][1].file.filename).toBe('image.jpg')
  })

  test('upload_image rejects an imageUrl whose type cannot be determined', async () => {
    const { manageGallery } = setup()
    mockFetch(async () => imageResponse({ contentType: null }))

    await expect(manageGallery.handler({ action: 'upload_image', imageUrl: 'https://example.com/download' }))
      .rejects.toThrow('Could not tell the image type from imageUrl')
  })

  test('upload_image reports a non-OK imageUrl response', async () => {
    const { manageGallery } = setup()
    mockFetch(async () => imageResponse({ ok: false, status: 404 }))

    await expect(manageGallery.handler({ action: 'upload_image', imageUrl: 'https://example.com/missing.png' }))
      .rejects.toThrow('the server responded 404')
  })

  test('upload_image reports a failed imageUrl fetch', async () => {
    const { manageGallery } = setup()
    mockFetch(async () => { throw new Error('getaddrinfo ENOTFOUND') })

    await expect(manageGallery.handler({ action: 'upload_image', imageUrl: 'https://nope.invalid/a.png' }))
      .rejects.toThrow('Could not fetch imageUrl: getaddrinfo ENOTFOUND')
  })

  test('upload_image reads a local imagePath and uploads it', async () => {
    const { client, manageGallery } = setup()
    fs.readFile.mockResolvedValue(Buffer.from('local-bytes'))
    client.postForm.mockResolvedValue({ _id: 'i4', name: 'hero.jpg', url: 'https://cdn.example.com/hero.jpg' })

    await manageGallery.handler({ action: 'upload_image', imagePath: '/Users/me/pics/hero.jpg', name: 'Hero' })

    expect(fs.readFile).toHaveBeenCalledWith('/Users/me/pics/hero.jpg')
    expect(client.postForm).toHaveBeenCalledWith('/gallery/images', {
      fields: { name: 'Hero', parentFolderId: undefined },
      file: { fieldName: 'image', buffer: Buffer.from('local-bytes'), filename: 'hero.jpg', contentType: 'image/jpeg' }
    })
  })

  test('upload_image rejects an imagePath with an unsupported extension', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image', imagePath: '/tmp/doc.pdf' }))
      .rejects.toThrow('imagePath must end in .jpg, .jpeg, .png, .gif.')
  })

  test('upload_image reports an unreadable imagePath', async () => {
    const { manageGallery } = setup()
    fs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

    await expect(manageGallery.handler({ action: 'upload_image', imagePath: '/tmp/missing.png' }))
      .rejects.toThrow('Could not read imagePath: ENOENT: no such file')
  })

  test('upload_image still accepts base64 bytes with an explicit filename', async () => {
    const { client, manageGallery } = setup()
    client.postForm.mockResolvedValue({ _id: 'i1', name: 'logo.png', url: 'https://cdn.example.com/logo.png' })

    const result = await manageGallery.handler({ action: 'upload_image', imageBase64: Buffer.from('fake image bytes').toString('base64'), imageFileName: 'logo.PNG', parentFolderId: 'f1' })

    expect(client.postForm).toHaveBeenCalledWith('/gallery/images', {
      fields: { name: undefined, parentFolderId: 'f1' },
      file: { fieldName: 'image', buffer: Buffer.from('fake image bytes'), filename: 'logo.PNG', contentType: 'image/png' }
    })
    expect(result.content[0].text).toBe('Uploaded image "logo.png" (id i1) - https://cdn.example.com/logo.png.')
  })

  test('upload_image with base64 requires imageFileName', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image', imageBase64: 'abc' }))
      .rejects.toThrow('imageFileName is required when uploading with imageBase64.')
  })

  test('upload_image with base64 rejects an unsupported filename extension', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image', imageBase64: 'abc', imageFileName: 'doc.pdf' }))
      .rejects.toThrow('imageFileName must end in .jpg, .jpeg, .png, .gif.')
  })

  test('rename_image requires an imageId', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'rename_image', name: 'new.png' }))
      .rejects.toThrow('imageId is required.')
  })

  test('rename_image patches the name and reports the result', async () => {
    const { client, manageGallery } = setup()
    client.patch.mockResolvedValue({ _id: 'i1', name: 'new.png', url: 'https://cdn.example.com/new.png' })

    const result = await manageGallery.handler({ action: 'rename_image', imageId: 'i1', name: 'new.png' })

    expect(client.patch).toHaveBeenCalledWith('/gallery/images/i1', { name: 'new.png' })
    expect(result.content[0].text).toBe('Renamed image to "new.png" (id i1) - https://cdn.example.com/new.png.')
  })

  test('delete_image requires an imageId', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'delete_image' }))
      .rejects.toThrow('imageId is required.')
  })

  test('delete_image deletes by id', async () => {
    const { client, manageGallery } = setup()
    client.del.mockResolvedValue({})

    const result = await manageGallery.handler({ action: 'delete_image', imageId: 'i1' })

    expect(client.del).toHaveBeenCalledWith('/gallery/images/i1')
    expect(result.content[0].text).toBe('Deleted the image.')
  })
})
