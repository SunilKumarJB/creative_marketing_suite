import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Type,
  Tag,
  Download,
  Layers,
  RefreshCw,
  Upload,
  FileText,
  Heart,
  ChevronRight,
  Eye,
  Check,
  AlertCircle
} from 'lucide-react';
import './App.css';

function App() {
  // --- UI inputs ---
  const [channel, setChannel] = useState('Social Media');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('1K');
  const [category, setCategory] = useState('Fashion');
  const [campaignTheme, setCampaignTheme] = useState('Summer Oasis');
  const [productDesc, setProductDesc] = useState('Unisex linen resort shirts, breathable fabric, relaxed fit, pastel shades.');
  const [offers, setOffers] = useState('Get 25% Off with code SUMMER25');
  const [emotion, setEmotion] = useState('Sophisticated');
  const [festivalTheme, setFestivalTheme] = useState('Summer Solstice');
  const [refStyle, setRefStyle] = useState('Studio lighting, soft shadows, warm sunlight filter, high-end editorial');
  const [headlineSource, setHeadlineSource] = useState('GENERATE_NEW');
  const [language, setLanguage] = useState('English');
  const [logoImage, setLogoImage] = useState(null); // base64 string
  const [logoFileName, setLogoFileName] = useState('');
  const [logoImageDetails, setLogoImageDetails] = useState('Minimalist gold circular insignia vector');
  const [refImage, setRefImage] = useState(null); // base64 string
  const [refImageFileName, setRefImageFileName] = useState('');

  // --- Campaign generation states ---
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [generatingBaseImage, setGeneratingBaseImage] = useState(false);
  const [editingImage, setEditingImage] = useState(false);

  const [promptsData, setPromptsData] = useState(null);
  const [baseImage, setBaseImage] = useState(null);
  const [finalImage, setFinalImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // --- Quality Judge States ---
  const [judgeResult, setJudgeResult] = useState(null);
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState('');

  // --- Remix Quality Judge States ---
  const [remixJudgeResult, setRemixJudgeResult] = useState(null);
  const [remixJudging, setRemixJudging] = useState(false);
  const [remixJudgeError, setRemixJudgeError] = useState('');

  // Editable outputs from Step 1
  const [editableBasePrompt, setEditableBasePrompt] = useState('');
  const [editableEditPrompt, setEditableEditPrompt] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');

  // --- Visual Remixer & Editor states ---
  const [activeTab, setActiveTab] = useState('campaign'); // 'campaign' or 'remixer'
  const [remixRefImage, setRemixRefImage] = useState(null); // base64
  const [remixRefImageFileName, setRemixRefImageFileName] = useState('');
  const [remixEditInstruction, setRemixEditInstruction] = useState('Swap the dish with a hot bowl of spicy noodles, change the offer text to 30% OFF, and add a subtle glowing Diwali candle in the background');
  const [remixLogoImage, setRemixLogoImage] = useState(null); // base64
  const [remixLogoFileName, setRemixLogoFileName] = useState('');
  const [remixAspectRatio, setRemixAspectRatio] = useState('1:1');
  const [remixing, setRemixing] = useState(false);
  const [remixResultImage, setRemixResultImage] = useState(null); // base64

  // Remixer Handlers
  const handleRemixRefImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRemixRefImageFileName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const rawBase64 = reader.result.split(',')[1];
        setRemixRefImage(rawBase64);
      };
      reader.onerror = () => {
        setErrorMsg('Failed to read reference creative file.');
      };
    }
  };

  const handleRemixLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRemixLogoFileName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const rawBase64 = reader.result.split(',')[1];
        setRemixLogoImage(rawBase64);
      };
      reader.onerror = () => {
        setErrorMsg('Failed to read logo file.');
      };
    }
  };

  const handleRemixCreative = async () => {
    if (!remixRefImage) {
      setErrorMsg('Please upload a reference creative image first.');
      return;
    }
    setRemixing(true);
    setErrorMsg('');
    setRemixResultImage(null);

    try {
      const res = await fetch('/api/multimodal-layout-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_creative: remixRefImage,
          logo_image: remixLogoImage,
          edit_instruction: remixEditInstruction,
          aspect_ratio: remixAspectRatio
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to remix layout');
      }

      const data = await res.json();
      setRemixResultImage(data.image_base64);
      
      // Auto-trigger quality check judge for visual remixer
      triggerRemixJudgeValidation(data.image_base64);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRemixing(false);
    }
  };

  const triggerRemixJudgeValidation = async (editedImgB64) => {
    setRemixJudging(true);
    setRemixJudgeResult(null);
    setRemixJudgeError('');
    try {
      const res = await fetch('/api/validate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_image: remixRefImage,
          edited_image: editedImgB64,
          edit_prompt: remixEditInstruction,
          offer_callout: ""
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to validate remix creative quality');
      }
      const data = await res.json();
      setRemixJudgeResult(data);
    } catch (err) {
      console.error("Remix quality verification failed:", err.message);
      setRemixJudgeError(err.message);
    } finally {
      setRemixJudging(false);
    }
  };

  // Handle Logo Upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFileName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const rawBase64 = reader.result.split(',')[1];
        setLogoImage(rawBase64);
      };
      reader.onerror = () => {
        setErrorMsg('Failed to read logo file.');
      };
    }
  };

  // Handle Reference Image Upload
  const handleRefImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRefImageFileName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const rawBase64 = reader.result.split(',')[1];
        setRefImage(rawBase64);
      };
      reader.onerror = () => {
        setErrorMsg('Failed to read reference image file.');
      };
    }
  };

  // Step 1: Generate Marketing Copy & Prompts
  const handleGeneratePrompts = async () => {
    setGeneratingPrompts(true);
    setErrorMsg('');
    setPromptsData(null);
    setBaseImage(null);
    setFinalImage(null);

    const payload = {
      Channel: channel,
      channel_guidelines: [
        aspectRatio + ' aspect ratio',
        'Word limit matching ' + channel + ' standards'
      ],
      Dimensions: `${aspectRatio} at ${resolution} quality`,
      Category: category,
      Campaign_Theme: campaignTheme,
      'Product Description': productDesc,
      Offers: offers,
      Emotion: emotion,
      Festival_Theme: festivalTheme,
      Reference_Style: refStyle,
      Logo_Image_Details: logoImageDetails,
      'Headline Text Source': headlineSource,
      Language: language,
      reference_image: refImage
    };

    try {
      const res = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to generate prompts');
      }
      const data = await res.json();
      setPromptsData(data);
      setEditableBasePrompt(data.base_image_generation_prompt.prompt_text);
      setEditableEditPrompt(data.nano_banana_edit_prompt.prompt_text);

      // Map generated aspect ratio to config standard values
      const ar = data.aspect_ratio || '1:1';
      setSelectedAspectRatio(ar.includes(':') ? ar : '1:1');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingPrompts(false);
    }
  };

  // Step 2: Generate Base Image
  const handleGenerateBaseImage = async () => {
    setGeneratingBaseImage(true);
    setErrorMsg('');
    setBaseImage(null);
    setFinalImage(null);

    try {
      const res = await fetch('/api/generate-base-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editableBasePrompt,
          aspect_ratio: selectedAspectRatio,
          resolution: resolution
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to generate base image');
      }
      const data = await res.json();
      setBaseImage(data.image_base64);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setGeneratingBaseImage(false);
    }
  };

  // Step 3: Apply Logo & Text Overlay (Edit)
  const handleApplyLogoAndText = async () => {
    setEditingImage(true);
    setErrorMsg('');
    setFinalImage(null);

    try {
      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_image: baseImage,
          logo_image: logoImage,
          reference_image: refImage,
          edit_prompt: editableEditPrompt,
          aspect_ratio: selectedAspectRatio
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to apply overlay edits');
      }
      const data = await res.json();
      setFinalImage(data.image_base64);
      
      // Auto-trigger quality check judge
      triggerJudgeValidation(data.image_base64);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setEditingImage(false);
    }
  };

  const triggerJudgeValidation = async (editedImgB64) => {
    setJudging(true);
    setJudgeResult(null);
    setJudgeError('');
    try {
      const res = await fetch('/api/validate-creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_image: refImage,
          edited_image: editedImgB64,
          edit_prompt: editableEditPrompt,
          offer_callout: offers
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to validate creative quality');
      }
      const data = await res.json();
      setJudgeResult(data);
    } catch (err) {
      console.error("Quality verification failed:", err.message);
      setJudgeError(err.message);
    } finally {
      setJudging(false);
    }
  };

  // Download Final Image Helper
  const handleDownload = () => {
    if (!finalImage) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${finalImage}`;
    link.download = `cymbal_creative_${campaignTheme.toLowerCase().replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="premium-header">
        <div className="header-left">
          <div className="header-logo-container">
            <div className="insignia-circle">C</div>
            <h1>CYMBAL <span className="brand-suite">CREATIVE SUITE</span></h1>
          </div>
          <p className="header-tagline">AI-Powered Marketing Campaign Builder & Image Composer</p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tabs-navigation">
        <button
          className={`tab-link ${activeTab === 'campaign' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('campaign');
            setErrorMsg('');
          }}
        >
          <Sparkles size={16} />
          <span>AI Campaign Parameters Builder</span>
        </button>
        <button
          className={`tab-link ${activeTab === 'remixer' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('remixer');
            setErrorMsg('');
          }}
        >
          <Layers size={16} />
          <span>Visual Remixer & Editor</span>
        </button>
      </div>

      {activeTab === 'remixer' ? (
        <main className="main-content remixer-mode animate-fade">
          {/* Left panel: Remixer Parameters */}
          <section className="form-card card">
            <div className="card-header">
              <Layers className="icon-teal" />
              <h2>Remix Parameters</h2>
            </div>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Upload Reference Creative Banner (Required)</label>
                <div className="upload-container">
                  <label className="upload-btn">
                    <Upload size={16} />
                    <span>Choose file</span>
                    <input type="file" accept="image/*" onChange={handleRemixRefImageUpload} style={{ display: 'none' }} />
                  </label>
                  <span className="file-name-label">{remixRefImageFileName || 'Select an existing banner image'}</span>
                </div>
              </div>

              <div className="form-group full-width">
                <label>Visual & Content Modification Instructions</label>
                <textarea
                  value={remixEditInstruction}
                  onChange={(e) => setRemixEditInstruction(e.target.value)}
                  placeholder="e.g. Swap the dish with a hot bowl of spicy noodles, change the offer text to 30% OFF, and add a subtle glowing Diwali candle in the background"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>Upload Brand Logo (Optional)</label>
                <div className="upload-container">
                  <label className="upload-btn">
                    <Upload size={16} />
                    <span>Choose file</span>
                    <input type="file" accept="image/*" onChange={handleRemixLogoUpload} style={{ display: 'none' }} />
                  </label>
                  <span className="file-name-label">{remixLogoFileName || 'Default gold logo will be used'}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Output Aspect Ratio</label>
                <select value={remixAspectRatio} onChange={(e) => setRemixAspectRatio(e.target.value)}>
                  <option value="1:1">Square (1:1)</option>
                  <option value="3:2">Landscape (3:2)</option>
                  <option value="2:3">Portrait (2:3)</option>
                  <option value="3:4">Portrait (3:4)</option>
                  <option value="1:4">Tall Strip (1:4)</option>
                  <option value="4:1">Wide Strip (4:1)</option>
                  <option value="4:3">Landscape (4:3)</option>
                  <option value="4:5">Portrait (4:5)</option>
                  <option value="5:4">Landscape (5:4)</option>
                  <option value="1:8">Panoramic Strip (1:8)</option>
                  <option value="8:1">Banner Strip (8:1)</option>
                  <option value="9:16">Story/Tall (9:16)</option>
                  <option value="16:9">Wide/Landscape (16:9)</option>
                  <option value="21:9">Ultra-Wide (21:9)</option>
                  <option value="9:21">Ultra-Tall (9:21)</option>
                </select>
              </div>
            </div>

            <button
              className="action-btn primary-btn btn-large"
              onClick={handleRemixCreative}
              disabled={remixing}
            >
              {remixing ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  <span>Re-composing Layout...</span>
                </>
              ) : (
                <>
                  <Layers size={16} />
                  <span>Remix & Compose Creative</span>
                </>
              )}
            </button>

            {errorMsg && (
              <div className="error-banner card animate-fade">
                <AlertCircle className="icon-red" />
                <span>{errorMsg}</span>
              </div>
            )}
          </section>

          {/* Right panel: Before / After Displays */}
          <section className="preview-card card flex-column justify-center align-center">
            <div className="card-header">
              <ImageIcon className="icon-teal" />
              <h2>Remix Visual Workspace</h2>
            </div>

            <div className="remix-workspace-grid">
              <div className="remix-workspace-item">
                <h3>Original Reference Creative</h3>
                <div className="remix-image-wrapper">
                  {remixRefImage ? (
                    <img src={`data:image/png;base64,${remixRefImage}`} alt="Uploaded Reference" className="visual-preview" />
                  ) : (
                    <div className="empty-state">
                      <Upload size={32} />
                      <p>Upload a reference banner on the left to start</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="remix-workspace-item">
                <h3>Remixed Final Creative</h3>
                <div className="remix-image-wrapper">
                  {remixResultImage ? (
                    <div className="result-img-container">
                      <img src={`data:image/png;base64,${remixResultImage}`} alt="Remix Result" className="visual-preview" />
                      <button className="download-btn-overlay" onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:image/png;base64,${remixResultImage}`;
                        link.download = 'remixed_creative.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}>
                        <Download size={16} /> Download
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state">
                      {remixing ? (
                        <>
                          <RefreshCw className="animate-spin text-teal" size={32} />
                          <p>Gemini is re-composing the layout...</p>
                        </>
                      ) : (
                        <>
                          <ImageIcon size={32} />
                          <p>Your remixed layout will appear here</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Remixer Quality Judge Scorecard */}
            {(remixJudging || remixJudgeResult || remixJudgeError) && (
              <div className="judge-scorecard animate-fade" style={{ width: '100%', marginTop: '24px' }}>
                <div className="scorecard-header">
                  <Sparkles className="icon-gold" size={18} />
                  <h3>AI Remixer Quality Audit</h3>
                  {remixJudging && <span className="audit-loading-badge">Evaluating...</span>}
                  {remixJudgeError && <span className="audit-error-badge" style={{ backgroundColor: 'rgba(231, 29, 54, 0.15)', color: '#e71d36', border: '1px solid #e71d36' }}>Audit Failed</span>}
                </div>
                
                {remixJudging ? (
                  <div className="judge-loading-state">
                    <RefreshCw className="spinner" />
                    <p>Critiquing layout cloning integrity, prompt execution, product dominance, typos, and legal line rules...</p>
                  </div>
                ) : remixJudgeError ? (
                  <div className="judge-error-state" style={{ padding: '15px 0', textAlign: 'center', color: '#e71d36' }}>
                    <AlertCircle size={32} style={{ marginBottom: '8px' }} />
                    <p style={{ fontSize: '13px', margin: '0 0 12px 0' }}>{remixJudgeError}</p>
                    <button 
                      className="action-btn secondary-btn" 
                      onClick={() => triggerRemixJudgeValidation(remixResultImage)}
                    >
                      Retry Quality Audit
                    </button>
                  </div>
                ) : (
                  remixJudgeResult && (
                    <div className="scorecard-body">
                      <div className="score-overview-row">
                        <div className={`score-ring ${remixJudgeResult.score >= 8 ? 'ring-high' : remixJudgeResult.score >= 5 ? 'ring-med' : 'ring-low'}`}>
                          <div className="score-number">{remixJudgeResult.score}</div>
                          <div className="score-total">/ 10</div>
                        </div>
                        <div className="reasoning-summary">
                          <h4>Audit Summary</h4>
                          <p>{remixJudgeResult.overall_reasoning}</p>
                        </div>
                      </div>

                      <div className="checks-list">
                        <div className="check-item">
                          <div className="check-title-row">
                            <span className="check-title">Layout & Text Styling</span>
                            <span className="check-status-badge">Aligned Layout</span>
                          </div>
                          <p className="check-details">{remixJudgeResult.text_style_and_logo_placement}</p>
                        </div>

                        <div className="check-item">
                          <div className="check-title-row">
                            <span className="check-title">Instruction Execution</span>
                            <span className="check-status-badge">Updates verified</span>
                          </div>
                          <p className="check-details">{remixJudgeResult.offer_callout_check}</p>
                        </div>

                        <div className="check-item">
                          <div className="check-title-row">
                            <span className="check-title">Typographical Integrity</span>
                            <span className="check-status-badge">Spelling Verified</span>
                          </div>
                          <p className="check-details">{remixJudgeResult.typo_check}</p>
                        </div>

                        <div className="check-item">
                          <div className="check-title-row">
                            <span className="check-title">Legal Disclaimer</span>
                            <span className="check-status-badge">TC Overlay Checked</span>
                          </div>
                          <p className="check-details">{remixJudgeResult.legal_line_check}</p>
                        </div>

                        <div className="check-item">
                          <div className="check-title-row">
                            <span className="check-title">Visual Dominance</span>
                            <span className="check-status-badge">Subject Focus</span>
                          </div>
                          <p className="check-details">{remixJudgeResult.product_dominance_check}</p>
                        </div>
                      </div>

                      <div className="button-group-right" style={{ marginTop: '15px' }}>
                        <button 
                          className="action-btn secondary-btn"
                          onClick={() => triggerRemixJudgeValidation(remixResultImage)}
                          disabled={remixJudging}
                        >
                          <RefreshCw size={14} className={remixJudging ? 'spinner' : ''} />
                          <span>Re-run Audit</span>
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="main-content">

          {/* Left Side: Campaign Configuration Form */}
          <section className="form-card card animate-fade">
            <div className="card-header">
              <Sparkles className="icon-teal" />
              <h2>Campaign Parameters</h2>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Business Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Fashion">Fashion & Apparel</option>
                  <option value="Electronics">Electronics & Tech</option>
                  <option value="Home Decor">Home & Living</option>
                  <option value="Retail">General Retail</option>
                  <option value="Food">Food & Beverage</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Channel</label>
                <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="Social Media">Social Media (Post/Story)</option>
                  <option value="Email Newsletter">Email Newsletter Header</option>
                  <option value="Website Banner">Website Hero Banner</option>
                  <option value="Google Display Ad">Google Display Ad</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Aspect Ratio</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                  <option value="1:1">Square (1:1)</option>
                  <option value="3:2">Landscape (3:2)</option>
                  <option value="2:3">Portrait (2:3)</option>
                  <option value="3:4">Portrait (3:4)</option>
                  <option value="1:4">Tall Strip (1:4)</option>
                  <option value="4:1">Wide Strip (4:1)</option>
                  <option value="4:3">Landscape (4:3)</option>
                  <option value="4:5">Portrait (4:5)</option>
                  <option value="5:4">Landscape (5:4)</option>
                  <option value="1:8">Panoramic Strip (1:8)</option>
                  <option value="8:1">Banner Strip (8:1)</option>
                  <option value="9:16">Story/Tall (9:16)</option>
                  <option value="16:9">Wide/Landscape (16:9)</option>
                  <option value="21:9">Ultra-Wide (21:9)</option>
                  <option value="9:21">Ultra-Tall (9:21)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Resolution</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="512">512px (Draft/Quick)</option>
                  <option value="1K">1K (Standard Web/Social)</option>
                  <option value="2K">2K (High Definition)</option>
                  <option value="4K">4K (Ultra High/Print)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Campaign Theme</label>
                <input
                  type="text"
                  value={campaignTheme}
                  onChange={(e) => setCampaignTheme(e.target.value)}
                  placeholder="e.g. Festival Light, Cyber Week, Cozy Winter"
                />
              </div>

              <div className="form-group full-width">
                <label>Product Description</label>
                <textarea
                  rows="2"
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  placeholder="Detailed description of the product or apparel..."
                />
              </div>

              <div className="form-group">
                <label>Offers / CTA</label>
                <input
                  type="text"
                  value={offers}
                  onChange={(e) => setOffers(e.target.value)}
                  placeholder="e.g. Buy 1 Get 1 Free, 20% OFF"
                />
              </div>

              <div className="form-group">
                <label>Target Emotion</label>
                <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                  <option value="Sophisticated">Sophisticated & Luxe</option>
                  <option value="Vibrant">Vibrant & Energetic</option>
                  <option value="Joyful">Warm & Joyful</option>
                  <option value="Minimalist">Minimalist & Clean</option>
                  <option value="Confident">Bold & Confident</option>
                </select>
              </div>

              <div className="form-group">
                <label>Festival Context</label>
                <select value={festivalTheme} onChange={(e) => setFestivalTheme(e.target.value)}>
                  <option value="Summer Solstice">Summer Solstice / Resort</option>
                  <option value="Diwali">Diwali (Lights & Sparklers)</option>
                  <option value="Christmas">Christmas & Holiday Cheer</option>
                  <option value="Spring Bloom">Spring Bloom / Fresh Start</option>
                  <option value="Eid">Eid Mubarak Celebration</option>
                  <option value="Autumn Fall">Autumn Harvest / Cozy</option>
                </select>
              </div>

              <div className="form-group">
                <label>Reference Style & Layout Description (Optional if Image Uploaded)</label>
                <input
                  type="text"
                  value={refStyle}
                  onChange={(e) => setRefStyle(e.target.value)}
                  placeholder="e.g. Studio lighting, logo on top-right"
                />
              </div>

              <div className="form-group">
                <label>Upload Reference Style/Layout Image (Optional)</label>
                <div className="upload-container">
                  <label className="upload-btn">
                    <Upload size={16} />
                    <span>Choose file</span>
                    <input type="file" accept="image/*" onChange={handleRefImageUpload} style={{ display: 'none' }} />
                  </label>
                  <span className="file-name-label">{refImageFileName || 'No reference file uploaded'}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Logo Image Details</label>
                <input
                  type="text"
                  value={logoImageDetails}
                  onChange={(e) => setLogoImageDetails(e.target.value)}
                  placeholder="e.g. White wordmark, high-contrast badge"
                />
              </div>

              <div className="form-group">
                <label>Upload Custom Brand Logo (PNG/JPEG)</label>
                <div className="upload-container">
                  <label className="upload-btn">
                    <Upload size={16} />
                    <span>Choose file</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                  <span className="file-name-label">{logoFileName || 'Default gold logo will be used'}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Headline Text Source & Behavior</label>
                <select value={headlineSource} onChange={(e) => setHeadlineSource(e.target.value)}>
                  <option value="GENERATE_NEW">Generate new contextual headline based on campaign parameters</option>
                  <option value="USE_REFERENCE">Use exact text visible in reference style/image</option>
                  <option value="NONE">No text overlay (only overlay logo)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi (हिंदी)</option>
                  <option value="Tamil">Tamil (தமிழ்)</option>
                  <option value="Telugu">Telugu (తెలుగు)</option>
                  <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                  <option value="Bengali">Bengali (বাংলা)</option>
                  <option value="Marathi">Marathi (मराठी)</option>
                </select>
              </div>
            </div>

            <button
              className="action-btn primary-btn btn-large"
              onClick={handleGeneratePrompts}
              disabled={generatingPrompts}
            >
              {generatingPrompts ? (
                <>
                  <RefreshCw className="spinner" />
                  <span>Crafting Copy & Prompts...</span>
                </>
              ) : (
                <>
                  <Sparkles />
                  <span>Generate Ad Plan & Prompts</span>
                </>
              )}
            </button>
          </section>

          {/* Right Side: Interactive Sandbox Stage View */}
          <section className="sandbox-panel">

            {errorMsg && (
              <div className="error-alert">
                <AlertCircle />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Prompt Copy Preview Section */}
            {promptsData && (
              <div className="sandbox-card card animate-fade">
                <div className="card-header">
                  <FileText className="icon-gold" />
                  <h2>Generated Creative Copy</h2>
                </div>
                <div className="copy-container">
                  <div className="copy-item">
                    <span className="copy-label">Headline Title</span>
                    <p className="copy-val">{promptsData.marketing_message.text_message.title}</p>
                  </div>
                  <div className="copy-item">
                    <span className="copy-label">Description Body</span>
                    <p className="copy-val">{promptsData.marketing_message.text_message.description}</p>
                  </div>
                  <div className="copy-item">
                    <span className="copy-label">In-Image Render Text</span>
                    <p className="copy-val italic">{promptsData.marketing_message.text_message.img_overlay_text}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Base Image Prompt Sandbox */}
            {promptsData && (
              <div className="sandbox-card card animate-fade">
                <div className="card-header">
                  <ImageIcon className="icon-teal" />
                  <h2>Step 1: Generate Product Base Image</h2>
                </div>
                <div className="prompt-editor">
                  <div className="form-group full-width">
                    <label>Base Image Generation Prompt (Clean Product Visual - No Text/Logos)</label>
                    <textarea
                      rows="3"
                      value={editableBasePrompt}
                      onChange={(e) => setEditableBasePrompt(e.target.value)}
                    />
                  </div>
                  <div className="prompt-meta-row">
                    <div className="form-group">
                      <label>Aspect Ratio</label>
                      <select value={selectedAspectRatio} onChange={(e) => setSelectedAspectRatio(e.target.value)}>
                        <option value="1:1">Square (1:1)</option>
                        <option value="3:2">Landscape (3:2)</option>
                        <option value="2:3">Portrait (2:3)</option>
                        <option value="3:4">Portrait (3:4)</option>
                        <option value="1:4">Tall Strip (1:4)</option>
                        <option value="4:1">Wide Strip (4:1)</option>
                        <option value="4:3">Landscape (4:3)</option>
                        <option value="4:5">Portrait (4:5)</option>
                        <option value="5:4">Landscape (5:4)</option>
                        <option value="1:8">Panoramic Strip (1:8)</option>
                        <option value="8:1">Banner Strip (8:1)</option>
                        <option value="9:16">Story/Tall (9:16)</option>
                        <option value="16:9">Wide/Landscape (16:9)</option>
                        <option value="21:9">Ultra-Wide (21:9)</option>
                        <option value="9:21">Ultra-Tall (9:21)</option>
                      </select>
                    </div>
                    <button
                      className="action-btn secondary-btn"
                      onClick={handleGenerateBaseImage}
                      disabled={generatingBaseImage}
                    >
                      {generatingBaseImage ? (
                        <>
                          <RefreshCw className="spinner" />
                          <span>Rendering Base...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon size={18} />
                          <span>Render Base Image</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Rendered Base Image Frame */}
                {baseImage && (
                  <div className="image-frame-container animate-fade">
                    <div className="image-tag base-tag">Logo & Text-Free Base Image</div>
                    <img src={`data:image/png;base64,${baseImage}`} alt="Generated Base Product" className="rendered-preview-img" />
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Image Editing / Compositing Sandbox */}
            {baseImage && (
              <div className="sandbox-card card animate-fade">
                <div className="card-header">
                  <Layers className="icon-gold" />
                  <h2>Step 2: Overlay Brand Assets & Multi-Language Typography</h2>
                </div>
                <div className="prompt-editor">
                  <div className="form-group full-width">
                    <label>Nano Banana Pro Edit & Composing Prompt</label>
                    <textarea
                      rows="3"
                      value={editableEditPrompt}
                      onChange={(e) => setEditableEditPrompt(e.target.value)}
                    />
                  </div>
                  <div className="button-group-right">
                    <button
                      className="action-btn gold-btn btn-large"
                      onClick={handleApplyLogoAndText}
                      disabled={editingImage}
                    >
                      {editingImage ? (
                        <>
                          <RefreshCw className="spinner" />
                          <span>Fusing Assets & Rendering text...</span>
                        </>
                      ) : (
                        <>
                          <Layers size={18} />
                          <span>Apply Logo & Render Text</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Rendered Final Creative Frame */}
                <>
                  {finalImage && (
                    <div className="image-frame-container animate-fade highlight-border">
                      <div className="image-tag final-tag">Final Ad Creative</div>
                      <img src={`data:image/png;base64,${finalImage}`} alt="Final marketing campaign asset" className="rendered-preview-img" />
                      <div className="image-actions-overlay">
                        <button className="action-btn success-btn" onClick={handleDownload}>
                          <Download size={18} />
                          <span>Download Creative</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Creative Quality Judge Scorecard */}
                  {(judging || judgeResult || judgeError) && (
                    <div className="judge-scorecard animate-fade">
                      <div className="scorecard-header">
                        <Sparkles className="icon-gold" size={18} />
                        <h3>AI Creative Quality Audit</h3>
                        {judging && <span className="audit-loading-badge">Evaluating...</span>}
                        {judgeError && <span className="audit-error-badge" style={{ backgroundColor: 'rgba(231, 29, 54, 0.15)', color: '#e71d36', border: '1px solid #e71d36' }}>Audit Failed</span>}
                      </div>
                      
                      {judging ? (
                        <div className="judge-loading-state">
                          <RefreshCw className="spinner" />
                          <p>Critiquing layout styles, exact offer matches, product dominance, typos, and legal line rules...</p>
                        </div>
                      ) : judgeError ? (
                        <div className="judge-error-state" style={{ padding: '15px 0', textAlign: 'center', color: '#e71d36' }}>
                          <AlertCircle size={32} style={{ marginBottom: '8px' }} />
                          <p style={{ fontSize: '13px', margin: '0 0 12px 0' }}>{judgeError}</p>
                          <button 
                            className="action-btn secondary-btn" 
                            onClick={() => triggerJudgeValidation(finalImage)}
                          >
                            Retry Quality Audit
                          </button>
                        </div>
                      ) : (
                        judgeResult && (
                          <div className="scorecard-body">
                            <div className="score-overview-row">
                              <div className={`score-ring ${judgeResult.score >= 8 ? 'ring-high' : judgeResult.score >= 5 ? 'ring-med' : 'ring-low'}`}>
                                <div className="score-number">{judgeResult.score}</div>
                                <div className="score-total">/ 10</div>
                              </div>
                              <div className="reasoning-summary">
                                <h4>Audit Summary</h4>
                                <p>{judgeResult.overall_reasoning}</p>
                              </div>
                            </div>

                            <div className="checks-list">
                              <div className="check-item">
                                <div className="check-title-row">
                                  <span className="check-title">Text Style & Logo Placement</span>
                                  <span className="check-status-badge">Aligned Layout</span>
                                </div>
                                <p className="check-details">{judgeResult.text_style_and_logo_placement}</p>
                              </div>

                              <div className="check-item">
                                <div className="check-title-row">
                                  <span className="check-title">Exact Offer Callout</span>
                                  <span className="check-status-badge">Unmodified text</span>
                                </div>
                                <p className="check-details">{judgeResult.offer_callout_check}</p>
                              </div>

                              <div className="check-item">
                                <div className="check-title-row">
                                  <span className="check-title">Typographical Integrity</span>
                                  <span className="check-status-badge">Spelling Verified</span>
                                </div>
                                <p className="check-details">{judgeResult.typo_check}</p>
                              </div>

                              <div className="check-item">
                                <div className="check-title-row">
                                  <span className="check-title">Legal Disclaimer</span>
                                  <span className="check-status-badge">TC Overlay Checked</span>
                                </div>
                                <p className="check-details">{judgeResult.legal_line_check}</p>
                              </div>

                              <div className="check-item">
                                <div className="check-title-row">
                                  <span className="check-title">Visual Dominance</span>
                                  <span className="check-status-badge">Subject Focus</span>
                                </div>
                                <p className="check-details">{judgeResult.product_dominance_check}</p>
                              </div>
                            </div>

                            <div className="button-group-right" style={{ marginTop: '15px' }}>
                              <button 
                                className="action-btn secondary-btn"
                                onClick={() => triggerJudgeValidation(finalImage)}
                                disabled={judging}
                              >
                                <RefreshCw size={14} className={judging ? 'spinner' : ''} />
                                <span>Re-run Audit</span>
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </>
              </div>
            )}

            {/* Empty state when nothing has been generated yet */}
            {!promptsData && !generatingPrompts && (
              <div className="empty-sandbox-state">
                <Sparkles size={48} className="icon-pulse" />
                <h3>Awaiting Input Parameters</h3>
                <p>Fill out the parameters on the left and click "Generate Ad Plan" to start composing your campaign assets.</p>
              </div>
            )}

          </section>

        </main>
      )}

      <footer className="creative-footer">
        <p>Built exclusively for <span className="cymbal-text">Cymbal Brand Ecosystem</span>. Driven by Google Vertex AI Gemini 3 Pro & 3.5 Flash.</p>
      </footer>
    </div>
  );
}

export default App;
