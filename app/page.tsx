"use client";

import { useState } from "react";
import React from "react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]); 
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>(""); 
  const [extractedInvoices, setExtractedInvoices] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);


  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFiles = (fileList: File[]): string | null => {
    // Check file count (max 20 files)
    if (fileList.length > 50) {
      return "Maximum 50 invoices at a time";
    }
  
    if (fileList.length === 0) {
      return "Please select at least one file";
    }
  
    // Check each file
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
  
      // Check file type
      if (file.type !== "application/pdf") {
        return `File "${file.name}" is not a PDF`;
      }
  
      // Check file size (10MB max)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return `File "${file.name}" exceeds 10MB limit`;
      }
    }
  
    return null; // No errors
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError("");
  
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const validationError = validateFiles(droppedFiles);
  
      if (validationError) {
        setError(validationError);
        return;
      }
  
      setFiles(droppedFiles);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
  
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const validationError = validateFiles(selectedFiles);
  
      if (validationError) {
        setError(validationError);
        return;
      }
  
      setFiles(selectedFiles);
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
  
    setLoading(true);
    setError("");
    setExtractedInvoices([]); // Clear previous results
  
    const results: any[] = [];
    const failedFiles: string[] = [];
  
    try {
      console.log(`📤 Processing ${files.length} invoices...`);
  
      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        setProcessingStatus(`Processing ${i + 1} of ${files.length}: ${file.name}...`);
  
        try {
          const formData = new FormData();
          formData.append("file", file);
  
          const response = await fetch("/api/extract", {
            method: "POST",
            body: formData,
          });
  
          const result = await response.json();
  
          if (!response.ok) {
            throw new Error(result.error || "Failed to process");
          }
  
          console.log(`✅ Processed: ${file.name}`);
          
          // Add filename to result for reference
          results.push({
            ...result.data,
            _filename: file.name,
          });
  
        } catch (fileError: any) {
          console.error(`❌ Failed to process ${file.name}:`, fileError);
          failedFiles.push(file.name);
        }
  
        // Small delay to avoid rate limiting
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
  
      setExtractedInvoices(results);
      setProcessingStatus("");
  
      if (failedFiles.length > 0) {
        setError(`Failed to process: ${failedFiles.join(", ")}`);
      }
  
      console.log(`✅ Successfully processed ${results.length} of ${files.length} invoices`);
  
    } catch (err: any) {
      console.error("❌ Error:", err);
      setError(err.message);
      setProcessingStatus("");
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const exportToCSV = () => {
    if (extractedInvoices.length === 0) return;
  
    // Create CSV content
    let csv = "";
  
    // Header row
    csv += "Vendor,Invoice Number,Invoice Date,Due Date,PO Number,Description,Quantity,Unit Price,Line Total,Subtotal,Tax,Total\n";
  
    // Process each invoice
    extractedInvoices.forEach((invoice) => {
      if (invoice.line_items && invoice.line_items.length > 0) {
        // One row per line item
        invoice.line_items.forEach((item: any, index: number) => {
          csv += `"${invoice.vendor_name || ""}",`;
          csv += `"${invoice.invoice_number || ""}",`;
          csv += `"${invoice.invoice_date || ""}",`;
          csv += `"${invoice.due_date || ""}",`;
          csv += `"${invoice.purchase_order_number || ""}",`;
          csv += `"${item.description || ""}",`;
          csv += `${item.quantity || 0},`;
          csv += `${item.unit_price || 0},`;
          csv += `${item.line_total || 0},`;
          
          // Only include totals on the first row of each invoice
          if (index === 0) {
            csv += `${invoice.subtotal || 0},`;
            csv += `${invoice.tax_amount || 0},`;
            csv += `${invoice.total_amount || 0}`;
          } else {
            csv += `,,`; // Empty cells
          }
          
          csv += "\n";
        });
      } else {
        // Invoice with no line items
        csv += `"${invoice.vendor_name || ""}",`;
        csv += `"${invoice.invoice_number || ""}",`;
        csv += `"${invoice.invoice_date || ""}",`;
        csv += `"${invoice.due_date || ""}",`;
        csv += `"${invoice.purchase_order_number || ""}",`;
        csv += `"No line items",,,,`;
        csv += `${invoice.subtotal || 0},`;
        csv += `${invoice.tax_amount || 0},`;
        csv += `${invoice.total_amount || 0}\n`;
      }
    });
  
    // Create blob and download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `invoices-${timestamp}-${extractedInvoices.length}-items.csv`
    );
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateInvoice = (index: number, field: string, value: any) => {
    const updated = [...extractedInvoices];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setExtractedInvoices(updated);
  };
  
  const updateLineItem = (invoiceIndex: number, itemIndex: number, field: string, value: any) => {
    const updated = [...extractedInvoices];
    const updatedLineItems = [...updated[invoiceIndex].line_items];
    
    // Update the field
    updatedLineItems[itemIndex] = {
      ...updatedLineItems[itemIndex],
      [field]: value,
    };
    
    // Auto-calculate line total if quantity or unit_price changed
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? value : updatedLineItems[itemIndex].quantity;
      const price = field === 'unit_price' ? value : updatedLineItems[itemIndex].unit_price;
      updatedLineItems[itemIndex].line_total = (qty || 0) * (price || 0);
    }
    
    updated[invoiceIndex].line_items = updatedLineItems;
    
    // Recalculate invoice totals
    const subtotal = updatedLineItems.reduce((sum: number, item: any) => sum + (item.line_total || 0), 0);    updated[invoiceIndex].subtotal = subtotal;
    updated[invoiceIndex].total_amount = subtotal + (updated[invoiceIndex].tax_amount || 0);
    
    setExtractedInvoices(updated);
  };
  
  const addLineItem = (invoiceIndex: number) => {
    const updated = [...extractedInvoices];
    const newItem = {
      description: "New Item",
      quantity: 1,
      unit_price: 0,
      line_total: 0,
    };
    updated[invoiceIndex].line_items = [
      ...(updated[invoiceIndex].line_items || []),
      newItem,
    ];
    
    // Recalculate totals
    const subtotal = updated[invoiceIndex].line_items.reduce(
      (sum: number, item: any) => sum + (item.line_total || 0), 
      0
    );
    updated[invoiceIndex].subtotal = subtotal;
    updated[invoiceIndex].total_amount = subtotal + (updated[invoiceIndex].tax_amount || 0);
    
    setExtractedInvoices(updated);
  };
  
  const deleteLineItem = (invoiceIndex: number, itemIndex: number) => {
    const updated = [...extractedInvoices];
    updated[invoiceIndex].line_items = updated[invoiceIndex].line_items.filter(
      (_: any, idx: number) => idx !== itemIndex
    );
    
    // Recalculate totals after deletion
    const subtotal = updated[invoiceIndex].line_items.reduce(
      (sum: number, item: any) => sum + (item.line_total || 0), 
      0
    );
    updated[invoiceIndex].subtotal = subtotal;
    updated[invoiceIndex].total_amount = subtotal + (updated[invoiceIndex].tax_amount || 0);
    
    setExtractedInvoices(updated);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Invoice Data Extractor
          </h1>
          <p className="text-gray-600">
            Upload your invoice PDF and get QuickBooks-ready CSV in 30 seconds
          </p>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
           <input
  type="file"
  accept=".pdf,application/pdf"
  onChange={handleChange}
  className="hidden"
  id="file-upload"
  multiple
/>

            <label htmlFor="file-upload" className="cursor-pointer block">
            {files.length > 0 ? (
  <div>
    <svg className="mx-auto h-12 w-12 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-lg font-medium text-gray-900 mb-1">
      {files.length} invoice{files.length > 1 ? 's' : ''} selected
    </p>
    <div className="max-h-32 overflow-y-auto mb-4">
      {files.map((f, idx) => (
        <p key={idx} className="text-sm text-gray-600">
          {idx + 1}. {f.name} ({formatFileSize(f.size)})
        </p>
      ))}
    </div>
    <p className="text-sm text-blue-600 hover:text-blue-700">
      Click to change files
    </p>
  </div>
) : (
                <div>
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 mb-4"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="text-lg font-medium text-gray-900 mb-2">
  Drag and drop invoice PDFs here
</p>
<p className="text-sm text-gray-600 mb-4">
  or click to browse (select multiple files)
</p>
<p className="text-xs text-gray-500">
  Up to 50 invoices, PDF only, max 10MB each
</p>
                </div>
              )}
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          {files.length > 0 && !error && (
  <div className="mt-6">
    {processingStatus && (
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">{processingStatus}</p>
      </div>
    )}
    <button
      onClick={handleSubmit}
      disabled={loading}
      className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
    >
      {loading 
        ? "Processing..." 
        : `Extract Data from ${files.length} Invoice${files.length > 1 ? 's' : ''} →`
      }
    </button>
  </div>
)}
        </div>

        {/* Info Section */}
        {extractedInvoices.length === 0 && (
       <div className="mt-8 text-center text-sm text-gray-600">
            <p>✓ No signup required</p>
            <p>✓ Files are not stored on our servers</p>
            <p>✓ Free to use</p>
          </div>
        )}
      </div>

     
{/* Results Section */}
{extractedInvoices.length > 0 && (
  <div className="max-w-6xl mx-auto mt-8">
    <div className="bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Extracted Invoices ({extractedInvoices.length})
        </h2>
        <button
          onClick={() => {
            setExtractedInvoices([]);
            setFiles([]);
            setExpandedRow(null);
          }}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ← Process More Invoices
        </button>
      </div>

      {/* Invoice Table */}
      <div className="overflow-x-auto mb-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
          {extractedInvoices.map((invoice, idx) => (
  <React.Fragment key={idx}>
    {/* Main Row */}
    <tr
                  className={`hover:bg-gray-50 cursor-pointer ${
                    expandedRow === idx ? "bg-blue-50" : ""
                  }`}
                  onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {invoice.vendor_name || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {invoice.invoice_number || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {invoice.invoice_date || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {invoice.due_date || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    ${invoice.total_amount?.toFixed(2) || "0.00"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {invoice.line_items?.length || 0} item(s)
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedRow(expandedRow === idx ? null : idx);
                      }}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {expandedRow === idx ? "Close ▲" : "Edit ▼"}
                    </button>
                  </td>
                </tr>

                {/* Expanded Details Row */}
                {expandedRow === idx && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 bg-gray-50">
                      <div className="space-y-6">
                        {/* Vendor Information */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Vendor Information
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Vendor Name
                              </label>
                              <input
                                type="text"
                                value={invoice.vendor_name || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "vendor_name", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Email
                              </label>
                              <input
                                type="text"
                                value={invoice.vendor_email || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "vendor_email", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-600 mb-1">
                                Address
                              </label>
                              <input
                                type="text"
                                value={invoice.vendor_address || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "vendor_address", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Phone
                              </label>
                              <input
                                type="text"
                                value={invoice.vendor_phone || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "vendor_phone", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Invoice Details */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Invoice Details
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Invoice Number
                              </label>
                              <input
                                type="text"
                                value={invoice.invoice_number || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "invoice_number", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                PO Number
                              </label>
                              <input
                                type="text"
                                value={invoice.purchase_order_number || ""}
                                onChange={(e) =>
                                  updateInvoice(
                                    idx,
                                    "purchase_order_number",
                                    e.target.value
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Invoice Date
                              </label>
                              <input
                                type="date"
                                value={invoice.invoice_date || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "invoice_date", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Due Date
                              </label>
                              <input
                                type="date"
                                value={invoice.due_date || ""}
                                onChange={(e) =>
                                  updateInvoice(idx, "due_date", e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Line Items */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-semibold text-gray-700">
                              Line Items
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addLineItem(idx);
                              }}
                              className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                            >
                              + Add Item
                            </button>
                          </div>
                          <div className="space-y-2">
                            {invoice.line_items &&
                              invoice.line_items.map((item: any, itemIdx: number) => (
                                <div
                                  key={itemIdx}
                                  className="grid grid-cols-12 gap-2 items-end bg-white p-3 rounded border"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="col-span-5">
                                    <label className="block text-xs text-gray-600 mb-1">
                                      Description
                                    </label>
                                    <input
                                      type="text"
                                      value={item.description || ""}
                                      onChange={(e) =>
                                        updateLineItem(
                                          idx,
                                          itemIdx,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="block text-xs text-gray-600 mb-1">
                                      Qty
                                    </label>
                                    <input
                                      type="number"
                                      value={item.quantity || 0}
                                      onChange={(e) =>
                                        updateLineItem(
                                          idx,
                                          itemIdx,
                                          "quantity",
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="block text-xs text-gray-600 mb-1">
                                      Unit Price
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.unit_price || 0}
                                      onChange={(e) =>
                                        updateLineItem(
                                          idx,
                                          itemIdx,
                                          "unit_price",
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="block text-xs text-gray-600 mb-1">
                                      Total
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.line_total || 0}
                                      onChange={(e) =>
                                        updateLineItem(
                                          idx,
                                          itemIdx,
                                          "line_total",
                                          parseFloat(e.target.value) || 0
                                        )
                                      }
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    />
                                  </div>
                                  <div className="col-span-1">
                                    <button
                                      onClick={() => deleteLineItem(idx, itemIdx)}
                                      className="text-red-600 hover:text-red-800 text-xs"
                                      title="Delete item"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Amounts */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            Amounts
                          </h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Subtotal
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={invoice.subtotal || 0}
                                onChange={(e) =>
                                  updateInvoice(
                                    idx,
                                    "subtotal",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Tax
                              </label>
                              <input
  type="number"
  step="0.01"
  value={invoice.tax_amount || 0}
  onChange={(e) => {
    const newTax = parseFloat(e.target.value) || 0;
    const updated = [...extractedInvoices];
    updated[idx].tax_amount = newTax;
    updated[idx].total_amount = (updated[idx].subtotal || 0) + newTax;
    setExtractedInvoices(updated);
  }}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
  onClick={(e) => e.stopPropagation()}
/>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Total
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={invoice.total_amount || 0}
                                onChange={(e) =>
                                  updateInvoice(
                                    idx,
                                    "total_amount",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRow(null);
                            }}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
                          >
                            ✓ Save Changes
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  )}
                  </React.Fragment>
                ))}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Invoices</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedInvoices.length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900">
              $
              {extractedInvoices
                .reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
                .toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Line Items</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedInvoices.reduce(
                (sum, inv) => sum + (inv.line_items?.length || 0),
                0
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={exportToCSV}
        className="w-full bg-blue-600 text-white py-4 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors text-lg"
      >
        📥 Download Complete CSV ({extractedInvoices.length} invoices)
      </button>
      <div id="feedback-section" className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg">
        <div className="flex items-start space-x-4">
          <div className="text-4xl">💬</div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              You&apos;re an Early Tester! Help Shape This Tool 🚀
            </h3>
            <p className="text-gray-700 mb-4">
              Your feedback directly determines what features get built next. 
              <span className="font-semibold"> 2-minute survey = huge impact.</span>
            </p>
            <div className="flex space-x-3">
              
                <a href="https://forms.gle/z2W8khsBC4hWbkrU6"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Give Feedback (2 min) &rarr;
              </a>
              <button
                onClick={() => {
                  const section = document.getElementById('feedback-section');
                  if (section) section.style.display = 'none';
                }}
                className="text-gray-600 hover:text-gray-800 text-sm"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{/* Roadmap Teaser */}
<div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <p className="text-sm font-medium text-gray-900 mb-2">
    🚀 Coming Soon (based on your feedback):
  </p>
  <ul className="text-sm text-gray-700 space-y-1">
    <li>• Email forwarding (forward invoices, get CSV back)</li>
    <li>• Direct QuickBooks/Xero sync (no CSV import)</li>
    <li>• Invoice history & search</li>
    <li>• Image & email text support</li>
  </ul>
</div>
    </div>
  );
}