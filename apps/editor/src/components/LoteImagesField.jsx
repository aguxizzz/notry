import ImageUploadField from './ImageUploadField';

export default function LoteImagesField({ images = [], onChange, uploadFn, kind }) {
  const handleUploadAt = (index) => ({ url }) => {
    const next = [...images];
    next[index] = url;
    onChange(next);
  };

  const handleRemoveAt = (index) => () => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handleAddNew = ({ url }) => {
    onChange([...images, url]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {images.map((url, i) => (
        <ImageUploadField
          key={`${url}-${i}`}
          showLabel={false}
          value={url}
          uploadFn={uploadFn}
          kind={kind}
          onUpload={handleUploadAt(i)}
          onRemove={handleRemoveAt(i)}
        />
      ))}
      <ImageUploadField
        showLabel={false}
        value={null}
        uploadFn={uploadFn}
        kind={kind}
        onUpload={handleAddNew}
      />
    </div>
  );
}
