import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import './App.css'
import ReportComponent from './components/ReportComponent'

function App() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [resumeUploaded, setResumeUploaded] = useState(false)
    const [showReport, setShowReport] = useState(false)
    const [reportData, setReportData] = useState(null)

    // Refs for speech synthesis to prevent cutting off
    const synthesisRef = useRef(window.speechSynthesis)

    useEffect(() => {
        // Initial greeting speak only if resume is already uploaded (or default greeting if we skip upload)
    }, [])

    const speak = (text) => {
        // Cancel any current speaking
        synthesisRef.current.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        // Select a voice (optional logic could go here to find a specific English voice)
        synthesisRef.current.speak(utterance)
    }

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert("Your browser does not support Speech Recognition. Try Chrome or Edge.")
            return
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()

        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onstart = () => {
            setIsListening(true)
        }

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript
            setInput(transcript)
        }

        recognition.onend = () => {
            setIsListening(false)
        }

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error)
            setIsListening(false)
        }

        recognition.start()
    }

    const handleFileUpload = async (event) => {
        const file = event.target.files[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)
        setLoading(true)

        try {
            await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            setResumeUploaded(true)
            // Trigger first message with context
            const response = await axios.post('/api/chat', { message: "I have uploaded my resume. Please start the interview." })
            const botMessage = { role: 'assistant', content: response.data.response }
            setMessages([botMessage])
            speak(response.data.response)

        } catch (error) {
            console.error("Error uploading file:", error)
            alert("Failed to upload resume.")
        } finally {
            setLoading(false)
        }
    }

    const sendMessage = async () => {
        const textToSend = input.trim()
        if (!textToSend) return

        const userMessage = { role: 'user', content: textToSend }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setLoading(true)

        try {
            const response = await axios.post('/api/chat', { message: textToSend })
            const botResponseText = response.data.response
            const botMessage = { role: 'assistant', content: botResponseText }

            setMessages(prev => [...prev, botMessage])
            speak(botResponseText)

        } catch (error) {
            console.error("Error sending message:", error)
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to the interviewer.' }])
        } finally {
            setLoading(false)
        }
    }

    const endInterview = async () => {
        if (!confirm("Are you sure you want to end the interview and generate your report?")) return

        // Stop any ongoing speech immediately
        synthesisRef.current.cancel()

        setLoading(true)
        try {
            const response = await axios.post('/api/end_interview')
            const report = JSON.parse(response.data.report)
            setReportData(report)
            setShowReport(true)
        } catch (error) {
            console.error("Error ending interview:", error)
            alert("Failed to generate report.")
        } finally {
            setLoading(false)
        }
    }

    if (showReport) {
        return <ReportComponent data={reportData} />
    }

    if (!resumeUploaded) {
        return (
            <div className="container upload-screen">
                <h2>Welcome to Mock Interview Simulator</h2>
                <p>Please upload your Resume (PDF) to start.</p>
                <input type="file" accept=".pdf" onChange={handleFileUpload} disabled={loading} />
                {loading && <p>Analyzing your resume...</p>}
            </div>
        )
    }

    return (
        <div className="container">
            <div className="header">
                <strong>AI Interviewer</strong>
                <button className="end-button" onClick={endInterview}>End Interview</button>
            </div>
            <div className="chat-window">
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.role}`}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                ))}
                {loading && <div className="message assistant">Thinking...</div>}
            </div>
            <div className="input-area">
                <button
                    className={`mic-button ${isListening ? 'listening' : ''}`}
                    onClick={startListening}
                    disabled={loading}
                    title="Click to Speak"
                >
                    {isListening ? '🎤 Listening...' : '🎤'}
                </button>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type or speak your answer..."
                />
                <button onClick={sendMessage} disabled={loading}>Send</button>
            </div>
        </div>
    )
}

export default App
