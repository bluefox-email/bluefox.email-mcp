import { describe, expect, test } from 'vitest'
import { createGalleryTools } from './gallery.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageGallery] = createGalleryTools({ client })
  return { client, manageGallery }
}

describe('manage_gallery', () => {
  test('list_folders reports no folders here', async () => {
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

  test('upload_image requires imageBase64 and imageFileName', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image', imageBase64: 'abc' }))
      .rejects.toThrow('Both imageBase64 and imageFileName are required.')
  })

  test('upload_image rejects an unsupported file extension', async () => {
    const { manageGallery } = setup()

    await expect(manageGallery.handler({ action: 'upload_image', imageBase64: 'abc', imageFileName: 'doc.pdf' }))
      .rejects.toThrow('imageFileName must end in one of')
  })

  test('upload_image posts multipart form data and reports the result', async () => {
    const { client, manageGallery } = setup()
    client.postForm.mockResolvedValue({ _id: 'i1', name: 'logo.png', url: 'https://cdn.example.com/logo.png' })

    const result = await manageGallery.handler({ action: 'upload_image', imageBase64: Buffer.from('fake image bytes').toString('base64'), imageFileName: 'logo.PNG', parentFolderId: 'f1' })

    expect(client.postForm).toHaveBeenCalledWith('/gallery/images', {
      fields: { name: undefined, parentFolderId: 'f1' },
      file: { fieldName: 'image', buffer: Buffer.from('fake image bytes'), filename: 'logo.PNG', contentType: 'image/png' }
    })
    expect(result.content[0].text).toBe('Uploaded image "logo.png" (id i1) - https://cdn.example.com/logo.png.')
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
